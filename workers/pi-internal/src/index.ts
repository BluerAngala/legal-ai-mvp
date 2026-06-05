/**
 * PI-Internal Worker (内部中枢)
 *
 * 职责：实际工作调度中心
 * - 接收 pi-user 委派的任务
 * - 通过 LLM 动态规划执行步骤
 * - 动态发现可用 worker 能力
 * - 编排多 worker 协同
 * - 汇总执行结果
 *
 * 核心特性：
 * - 完全通用：不预设任务类型
 * - 动态编排：每个任务都重新规划
 * - 容错性强：worker 失败时尝试其他方案
 *
 * 重构要点：
 *   - 配置从 @legalai/config 读取
 *   - LLM 走 @legalai/llm
 *   - 引擎地址走 cfg.engine.url
 */

import { init } from "iii-sdk";
import { loadConfig } from "@legalai/config";
import { createLogger, unwrapApiRequest, wrapApiResponse } from "@legalai/core";
import { LLMClient, extractJson, type ChatMessage } from "@legalai/llm";

const cfg = loadConfig();
const log = createLogger("pi-internal-worker");

const llm = new LLMClient(cfg.llm);
const sdk = init(cfg.engine.url, {
	workerName: cfg.engine.workerName,
});

/* ---------- Types ---------- */

interface WorkerCapability {
	worker: string;
	function: string;
	description: string;
	parameters?: string;
}

interface ExecutionPlan {
	steps: Array<{
		step: number;
		description: string;
		function?: string;
		parameters?: unknown;
		dependsOn?: number[];
		optional?: boolean;
	}>;
	reasoning: string;
}

interface StepResult {
	step: number;
	description: string;
	status: "success" | "failed" | "skipped";
	result?: unknown;
	error?: string;
	duration: number;
}

interface ExecuteInput {
	originalQuestion: string;
	intent: string;
	domain: string;
	requirements: string[];
	history?: unknown[];
	attachments?: unknown[];
}

/* ---------- Worker 能力发现（不硬编码） ---------- */

let capabilitiesCache: WorkerCapability[] | null = null;
let capabilitiesCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

async function discoverCapabilities(): Promise<WorkerCapability[]> {
	if (capabilitiesCache && Date.now() - capabilitiesCacheTime < CACHE_TTL) {
		return capabilitiesCache;
	}

	try {
		const all = await sdk.listFunctions();
		const caps: WorkerCapability[] = all
			.filter((f) => !f.function_id.startsWith("pi-")) // 排除 pi 自己
			.map((f) => ({
				worker: f.function_id.split("::")[0],
				function: f.function_id,
				description: f.description ?? f.function_id,
			}));

		capabilitiesCache = caps;
		capabilitiesCacheTime = Date.now();
		log.info("发现 worker 能力", { count: caps.length });
		return caps;
	} catch (err) {
		log.error("发现能力失败", { err: String(err) });
		return capabilitiesCache ?? [];
	}
}

/* ---------- 任务规划（AI 动态规划） ---------- */

async function planExecution(task: {
	intent: string;
	domain: string;
	requirements: string[];
	availableCapabilities: WorkerCapability[];
}): Promise<ExecutionPlan> {
	const capsText = task.availableCapabilities
		.map((c) => `- ${c.function}: ${c.description}`)
		.join("\n");

	const prompt = `你是任务编排专家。根据用户需求和可用能力，规划执行步骤。

用户需求：${task.intent}
领域：${task.domain}
具体要求：
${task.requirements.map((r, i) => `${i + 1}. ${r}`).join("\n")}

可用 worker 能力：
${capsText}

请规划执行计划（纯 JSON，无 markdown）：
{
  "reasoning": "为什么这样规划",
  "steps": [
    {
      "step": 1,
      "description": "这一步做什么",
      "function": "worker.function_name（必须是上面列出的能力名）",
      "parameters": {"key": "value"},
      "dependsOn": [前序步骤编号],
      "optional": false
    }
  ]
}

规划原则：
1. 简单任务：1-2步完成
2. 复杂任务：分解为多个步骤
3. 步骤之间可以有依赖关系
4. 必要时并行执行（dependsOn 相同）
5. 优先使用最合适的能力
6. 如果没有合适的能力，步骤可以只描述不调用函数
7. 步骤要可执行、可验证`;

	try {
		const messages: ChatMessage[] = [
			{ role: "system", content: "你是任务编排专家。返回纯 JSON。" },
			{ role: "user", content: prompt },
		];
		const text = await llm.chat(messages, {
			temperature: 0.2,
			maxTokens: 2000,
			jsonMode: true,
		});
		const plan = extractJson<ExecutionPlan>(text);
		if (plan.steps && Array.isArray(plan.steps)) {
			return plan;
		}
	} catch (err) {
		log.error("规划失败", { err: String(err) });
	}

	// 降级：单步处理
	return {
		reasoning: "规划失败，使用直接回答",
		steps: [
			{
				step: 1,
				description: "直接回答用户问题",
				parameters: { question: task.intent },
			},
		],
	};
}

/* ---------- 计划执行 ---------- */

function resolveParameters(
	params: unknown,
	outputs: Record<number, unknown>,
): unknown {
	if (typeof params === "string") {
		// 支持 $step.N 引用前序步骤输出
		return params.replace(/\$step\.(\d+)/g, (_, n) => {
			const output = outputs[Number(n)];
			if (typeof output === "string") return output;
			if (output !== undefined) return JSON.stringify(output);
			return "";
		});
	}
	if (Array.isArray(params)) {
		return params.map((p) => resolveParameters(p, outputs));
	}
	if (params && typeof params === "object") {
		const resolved: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(params)) {
			resolved[k] = resolveParameters(v, outputs);
		}
		return resolved;
	}
	return params;
}

async function directLLMProcess(
	description: string,
	params: unknown,
	context: unknown,
): Promise<string> {
	const prompt = `${description}

参数：${JSON.stringify(params)}
上下文：${JSON.stringify(context).slice(0, 1000)}

请完成这个任务：`;

	try {
		const messages: ChatMessage[] = [
			{ role: "system", content: "你是专业助手。" },
			{ role: "user", content: prompt },
		];
		return await llm.chat(messages, { temperature: 0.3, maxTokens: 2000 });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return `处理失败: ${message}`;
	}
}

async function executePlan(
	plan: ExecutionPlan,
	context: unknown,
): Promise<{ steps: StepResult[]; outputs: Record<number, unknown> }> {
	const results: StepResult[] = [];
	const outputs: Record<number, unknown> = {};

	// 按步骤顺序执行
	for (const step of plan.steps) {
		const start = Date.now();

		try {
			// 检查依赖
			if (step.dependsOn && step.dependsOn.length > 0) {
				let depsSatisfied = true;
				for (const dep of step.dependsOn) {
					const depResult = results.find((r) => r.step === dep);
					if (!depResult || depResult.status !== "success") {
						if (step.optional) {
							results.push({
								step: step.step,
								description: step.description,
								status: "skipped",
								error: "依赖步骤失败",
								duration: Date.now() - start,
							});
							continue;
						}
						depsSatisfied = false;
					}
				}
				if (!depsSatisfied) continue;
			}

			// 准备参数（可以引用前序步骤的输出）
			const params = resolveParameters(step.parameters ?? {}, outputs);

			// 执行
			let result: unknown;
			if (step.function) {
				result = await sdk.trigger(step.function, params);
			} else {
				// 没有函数调用：直接用 LLM 处理
				result = await directLLMProcess(step.description, params, context);
			}

			outputs[step.step] = result;

			results.push({
				step: step.step,
				description: step.description,
				status: "success",
				result,
				duration: Date.now() - start,
			});

			log.info("步骤完成", { step: step.step, duration: Date.now() - start });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			log.error("步骤失败", { step: step.step, err: message });
			results.push({
				step: step.step,
				description: step.description,
				status: step.optional ? "skipped" : "failed",
				error: message,
				duration: Date.now() - start,
			});

			// 关键步骤失败时继续后续步骤（不阻塞）
		}
	}

	return { steps: results, outputs };
}

/* ---------- 结果汇总 ---------- */

async function synthesizeResults(
	task: ExecuteInput,
	plan: ExecutionPlan,
	execution: { steps: StepResult[] },
): Promise<string> {
	const successfulSteps = execution.steps.filter((s) => s.status === "success");
	const outputsText = successfulSteps
		.map(
			(s) =>
				`【步骤 ${s.step}】${s.description}\n结果：${typeof s.result === "string" ? s.result : JSON.stringify(s.result).slice(0, 1500)}`,
		)
		.join("\n\n");

	const prompt = `综合以下步骤的执行结果，形成最终答案给用户。

用户原始问题：${task.originalQuestion}
理解到的需求：${task.intent}
领域：${task.domain}

执行过程：
${plan.reasoning}

执行结果：
${outputsText}

请综合所有信息，形成专业、清晰、有理有据的最终答案：`;

	try {
		const messages: ChatMessage[] = [
			{ role: "system", content: "你是专业助手。综合所有信息给出最终答案。" },
			{ role: "user", content: prompt },
		];
		return await llm.chat(messages, { temperature: 0.3, maxTokens: 3000 });
	} catch (err) {
		// 降级：直接拼接
		return outputsText || "所有步骤均失败。";
	}
}

/* ---------- Functions ---------- */

async function piExecute(input: unknown): Promise<{
	finalAnswer: string;
	plan: ExecutionPlan;
	execution: { steps: StepResult[]; outputs: Record<number, unknown> };
	usedCapabilities: string[];
}> {
	const task = input as ExecuteInput;
	log.info("接收任务", { intent: task.intent });

	// 1. 发现可用能力
	const capabilities = await discoverCapabilities();

	// 2. AI 规划
	const plan = await planExecution({
		intent: task.intent,
		domain: task.domain,
		requirements: task.requirements,
		availableCapabilities: capabilities,
	});
	log.info("规划完成", { stepCount: plan.steps.length });

	// 3. 执行
	const execution = await executePlan(plan, task);

	// 4. 综合结果
	const finalAnswer = await synthesizeResults(task, plan, execution);

	return {
		finalAnswer,
		plan,
		execution,
		usedCapabilities: plan.steps
			.filter((s) => s.function)
			.map((s) => s.function as string),
	};
}

async function piCapabilities(): Promise<{
	count: number;
	capabilities: WorkerCapability[];
}> {
	const caps = await discoverCapabilities();
	return { count: caps.length, capabilities: caps };
}

async function piHealth(): Promise<{
	status: "ok";
	worker: string;
	role: string;
	model: string;
	provider: string;
	availableCapabilities: number;
}> {
	const caps = await discoverCapabilities();
	return {
		status: "ok",
		worker: cfg.engine.workerName,
		role: "内部调度中枢",
		model: cfg.llm.chatModel,
		provider: cfg.llm.provider,
		availableCapabilities: caps.length,
	};
}

/* ---------- HTTP Triggers ---------- */

sdk.registerTrigger({
	type: "http",
	function_id: "pi-internal::execute",
	config: { api_path: "/api/internal/execute", http_method: "POST" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "pi-internal::capabilities",
	config: { api_path: "/api/internal/capabilities", http_method: "GET" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "pi-internal::health",
	config: { api_path: "/api/internal/health", http_method: "GET" },
});

/* ---------- Function Registration ---------- */

sdk.registerFunction({ id: "pi-internal::execute", description: "PI internal execute" }, wrapApiResponse(piExecute));
sdk.registerFunction({ id: "pi-internal::capabilities", description: "PI internal capabilities" }, wrapApiResponse(piCapabilities));
sdk.registerFunction({ id: "pi-internal::health", description: "PI internal health" }, wrapApiResponse(piHealth));

log.info("pi-internal worker registered", {
	engine: cfg.engine.url,
	model: cfg.llm.chatModel,
});

export {
	piExecute,
	piCapabilities,
	piHealth,
	discoverCapabilities,
	planExecution,
	executePlan,
};
