/**
 * PI-User Worker (用户中枢)
 *
 * 职责：作为用户和内部 worker 集团之间的桥梁
 * - 接收任意用户问题（不限于法律）
 * - 通过 LLM 动态分析用户真实需求
 * - 委派给 pi-internal 进行实际工作调度
 * - 将内部结果转化为用户友好的回复
 *
 * 设计原则：完全通用，不预设任务类型
 *
 * 重构要点：
 *   - 配置从 @legalai/config 读取（无默认）
 *   - LLM 走 @legalai/llm（多 provider）
 *   - 引擎地址走 cfg.engine.url
 */

import { init } from "iii-sdk";
import { loadConfig } from "@legalai/config";
import { createLogger, unwrapApiRequest, wrapApiResponse } from "@legalai/core";
import { LLMClient, extractJson, type ChatMessage } from "@legalai/llm";

const cfg = loadConfig();
const log = createLogger("pi-user-worker");

const llm = new LLMClient(cfg.llm);
const sdk = init(cfg.engine.url, {
	workerName: cfg.engine.workerName,
	invocationTimeoutMs: 400_000,
});

/* ---------- Types ---------- */

interface AskInput {
	question: string;
	history?: Array<{ role: string; content: string }>;
	attachments?: unknown[];
}

interface Understanding {
	intent: string;
	domain: string;
	requirements: string[];
	clarifyingQuestions: string[];
}

/* ---------- Step 1: 理解用户需求（不预设类别） ---------- */

async function understandUserNeed(input: AskInput): Promise<Understanding> {
	const historyText = (input.history ?? [])
		.map((h) => `${h.role}: ${h.content}`)
		.join("\n");

	const prompt = `你是一个需求理解专家。分析用户的真实需求。

${historyText ? `对话历史：\n${historyText}\n` : ""}
当前用户输入："${input.question}"

请分析：
1. 用户真正想达成什么？（不限类型，可以是任何事情）
2. 涉及什么领域？
3. 完成任务需要什么前置信息/操作？
4. 如果信息不足，需要向用户澄清什么？

返回 JSON（纯 JSON，无 markdown）：
{
  "intent": "用户想做的核心事情（自由描述，不限类型）",
  "domain": "涉及领域（自由描述，如：法律咨询/技术问题/数据分析等）",
  "requirements": ["完成任务需要的具体步骤1", "步骤2", "..."],
  "clarifyingQuestions": ["如果信息不足，需要问用户的问题"]
}

注意：
- 不要预设用户问的是法律问题
- 用户可能问任何问题
- 保持开放和灵活`;

	try {
		const messages: ChatMessage[] = [
			{ role: "system", content: "你是需求理解专家。返回纯 JSON。" },
			{ role: "user", content: prompt },
		];
		const text = await llm.chat(messages, {
			temperature: 0.2,
			maxTokens: 800,
			jsonMode: true,
		});
		return extractJson<Understanding>(text);
	} catch (err) {
		log.error("需求理解失败", { err: String(err) });
	}

	// 降级：基础理解
	return {
		intent: input.question,
		domain: "未分类",
		requirements: [input.question],
		clarifyingQuestions: [],
	};
}

/* ---------- Step 2: 委派给 pi-internal ---------- */

async function delegateToInternal(task: {
	originalQuestion: string;
	intent: string;
	domain: string;
	requirements: string[];
	history?: unknown[];
	attachments?: unknown[];
}): Promise<unknown> {
	try {
		const result = await sdk.trigger("pi-internal::execute", task);
		return result;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.error("委派失败", { err: message });
		return {
			error: "内部调度失败",
			message,
			fallback: task.originalQuestion,
		};
	}
}

/* ---------- Step 3: 将内部结果转化为用户友好的回复 ---------- */

async function formatForUser(
	originalQuestion: string,
	understanding: Understanding,
	internalResult: unknown,
): Promise<string> {
	const prompt = `你是用户助手。已将用户问题交给内部系统处理，现在把结果转化为友好的回复。

用户原始问题："${originalQuestion}"
理解到的需求：${JSON.stringify(understanding)}
内部处理结果：${JSON.stringify(internalResult).slice(0, 3000)}

请用友好、专业的中文回复用户。回复要求：
1. 开头确认理解到用户的需求
2. 展示处理过程或引用依据（如果有）
3. 给出清晰的答案/建议
4. 如果需要用户提供更多信息，礼貌询问
5. 避免提及"内部系统"等技术细节`;

	try {
		const messages: ChatMessage[] = [
			{ role: "system", content: "你是一个专业、友好的用户助手。" },
			{ role: "user", content: prompt },
		];
		return await llm.chat(messages, { temperature: 0.4, maxTokens: 2500 });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		// 降级：直接展示原始结果
		const result = internalResult as { fallback?: string } | null;
		if (result?.fallback) {
			return `抱歉，处理您的问题时遇到问题：${message}\n\n您的问题已记录：${result.fallback}`;
		}
		return `处理结果：\n${JSON.stringify(internalResult, null, 2)}`;
	}
}

/* ---------- Functions ---------- */

async function piAsk(input: unknown): Promise<{
	answer: string;
	understanding: Understanding;
	internal: unknown;
}> {
	const args = unwrapApiRequest<AskInput>(input);
	const t0 = Date.now();
	log.info("收到问题", { question: args.question });
	// ── 短路路径：简单法律事实性问题 → 直接 search，不走 pi-internal ──
	if (isQuickLegalQuestion(args.question)) {
		log.info("走短路路径: 直接 search");
		const searchResult = await sdk.trigger("knowledge::search", {
			query: args.question,
			topK: 3,
			useCache: true,
		}) as { body?: { results?: Array<{ documentTitle?: string; content?: string }> } };
		const docs = searchResult?.body?.results ?? [];
		const answer = formatSearchResults(args.question, docs);
		log.info("piAsk 短路完成", { totalMs: Date.now() - t0, docsFound: docs.length });
		return {
			answer,
			understanding: { intent: args.question, domain: "法律", requirements: [], clarifyingQuestions: [] },
			internal: searchResult,
		};
	}
	// ── 完整路径：复杂问题走 pi-internal 动态编排 ──
	// 1. 理解需求
	const t1 = Date.now();
	const understanding = await understandUserNeed(args);
	log.info("理解完成", { understanding, durationMs: Date.now() - t1 });
	// 2. 委派给内部
	const t2 = Date.now();
	const internalResult = await delegateToInternal({
		originalQuestion: args.question,
		intent: understanding.intent,
		domain: understanding.domain,
		requirements: understanding.requirements,
		history: args.history,
		attachments: args.attachments,
	});
	log.info("内部执行完成", { durationMs: Date.now() - t2 });
	// 3. 友好化输出
	const t3 = Date.now();
	const answer = await formatForUser(args.question, understanding, internalResult);
	log.info("格式化完成", { durationMs: Date.now() - t3 });
	log.info("piAsk 总耗时", { totalMs: Date.now() - t0 });
	return { answer, understanding, internal: internalResult };
}
/* ─── 短路判断：哪些问题不需要 pi-internal ─── */
const QUICK_KEYWORDS = [
	"多久", "多少", "几年", "几天", "多少钱", "几天内",
	"规定", "条款", "法", "条", "试用期", "合同", "工资", "赔偿",
	"解除", "终止", "违约金", "加班", "年假", "社保",
	"权利", "义务", "责任", "时效", "诉讼", "仲裁",
];
const COMPLEX_KEYWORDS = [
	"收购", "并购", "尽调", "审查", "合同对比", "起草",
	"诉讼", "仲裁", "纠纷", "争议", "谈判",
];
function isQuickLegalQuestion(question: string): boolean {
	const q = question.toLowerCase();
	// 有复杂关键词 → 不短路
	if (COMPLEX_KEYWORDS.some((k) => q.includes(k))) return false;
	// 有法律事实关键词且问题短 → 短路
	const keywordCount = QUICK_KEYWORDS.filter((k) => q.includes(k)).length;
	return keywordCount >= 1 && question.length < 80;
}
function formatSearchResults(
	question: string,
	docs: Array<{ documentTitle?: string; content?: string }>,
): string {
	if (docs.length === 0) {
		return `抱歉，我在知识库中没有找到与"${question}"直接相关的内容。\n\n建议您：\n1. 换个关键词再试试\n2. 如果有具体合同，可以上传后让我帮您分析`;
	}
	const lines = docs.map((d) => {
		const title = d.documentTitle ?? "相关条款";
		const content = d.content ?? "";
		return `**${title}**\n${content}`;
	});
	return `根据知识库，以下是相关法律规定：\n\n${lines.join("\n\n")}`;
}

async function piChat(input: unknown): Promise<{
	answer: string;
	understanding: Understanding;
	internal: unknown;
}> {
	const { messages } = input as {
		messages: Array<{ role: string; content: string }>;
	};
	// 提取最后一轮问题
	const lastUserMessage = [...messages]
		.reverse()
		.find((m) => m.role === "user");
	const question = lastUserMessage?.content ?? "";

	return piAsk({
		question,
		history: messages.slice(0, -1),
	});
}

async function piHealth(): Promise<{
	status: "ok";
	worker: string;
	role: string;
	model: string;
	provider: string;
	capabilities: string[];
}> {
	return {
		status: "ok",
		worker: cfg.engine.workerName,
		role: "用户中枢",
		model: cfg.llm.chatModel,
		provider: cfg.llm.provider,
		capabilities: ["通用问题理解", "多轮对话", "友好化输出"],
	};
}

/* ---------- HTTP Triggers ---------- */

sdk.registerTrigger({
	type: "http",
	function_id: "pi-user::ask",
	config: { api_path: "/api/ask", http_method: "POST" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "pi-user::chat",
	config: { api_path: "/api/chat", http_method: "POST" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "pi-user::health",
	config: { api_path: "/api/ask/health", http_method: "GET" },
});

/* ---------- Function Registration ---------- */

sdk.registerFunction({ id: "pi-user::ask", description: "Pi-user ask" }, wrapApiResponse(piAsk));
sdk.registerFunction({ id: "pi-user::chat", description: "Pi-user chat" }, wrapApiResponse(piChat));
sdk.registerFunction({ id: "pi-user::health", description: "Pi-user health" }, wrapApiResponse(piHealth));

log.info("pi-user worker registered", {
	engine: cfg.engine.url,
	model: cfg.llm.chatModel,
});

export { piAsk, piChat, piHealth, understandUserNeed, formatForUser };
