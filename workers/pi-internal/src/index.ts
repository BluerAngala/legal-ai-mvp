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
 */

import { registerWorker, callFunction, listFunctions } from 'iii-sdk';
import OpenAI from 'openai';

const LLM_API_KEY = process.env.LLM_API_KEY || 'sk-crwfmfqcogblddlpymiqqaatuepooklkjdelsxephytdswwe';
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.siliconflow.cn/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'Pro/MiniMaxAI/MiniMax-M2.5';

const llm = new OpenAI({
  apiKey: LLM_API_KEY,
  baseURL: LLM_BASE_URL,
});

const worker = registerWorker('pi-internal');

// ============================================
// Worker 能力发现（不硬编码）
// ============================================

interface WorkerCapability {
  worker: string;
  function: string;
  description: string;
  parameters?: string;
}

let capabilitiesCache: WorkerCapability[] | null = null;
let capabilitiesCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

/**
 * 动态发现所有可用 worker 能力
 */
async function discoverCapabilities(): Promise<WorkerCapability[]> {
  if (capabilitiesCache && Date.now() - capabilitiesCacheTime < CACHE_TTL) {
    return capabilitiesCache;
  }

  try {
    const all = await listFunctions();
    const caps: WorkerCapability[] = all
      .filter(f => !f.name.startsWith('pi-')) // 排除 pi 自己
      .map(f => ({
        worker: f.name.split('.')[0],
        function: f.name,
        description: f.description || f.name,
        parameters: f.parameters ? JSON.stringify(f.parameters) : undefined,
      }));

    capabilitiesCache = caps;
    capabilitiesCacheTime = Date.now();
    console.log(`[pi-internal] 发现 ${caps.length} 个 worker 能力`);
    return caps;
  } catch (err) {
    console.error('[pi-internal] 发现能力失败:', err);
    return capabilitiesCache || [];
  }
}

// ============================================
// 任务规划（AI 动态规划）
// ============================================

interface ExecutionPlan {
  steps: Array<{
    step: number;
    description: string;
    function?: string;
    parameters?: any;
    dependsOn?: number[];
    optional?: boolean;
  }>;
  reasoning: string;
}

/**
 * AI 规划执行步骤
 */
async function planExecution(task: {
  intent: string;
  domain: string;
  requirements: string[];
  availableCapabilities: WorkerCapability[];
}): Promise<ExecutionPlan> {
  const capsText = task.availableCapabilities
    .map(c => `- ${c.function}: ${c.description}`)
    .join('\n');

  const prompt = `你是任务编排专家。根据用户需求和可用能力，规划执行步骤。

用户需求：${task.intent}
领域：${task.domain}
具体要求：
${task.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

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
    const response = await llm.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: '你是任务编排专家。返回纯 JSON。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const plan = JSON.parse(jsonMatch[0]);
      // 简单校验
      if (plan.steps && Array.isArray(plan.steps)) {
        return plan;
      }
    }
  } catch (err) {
    console.error('[pi-internal] 规划失败:', err);
  }

  // 降级：单步处理
  return {
    reasoning: '规划失败，使用直接回答',
    steps: [{
      step: 1,
      description: '直接回答用户问题',
      parameters: { question: task.intent },
    }],
  };
}

// ============================================
// 计划执行
// ============================================

interface StepResult {
  step: number;
  description: string;
  status: 'success' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  duration: number;
}

/**
 * 执行计划
 */
async function executePlan(plan: ExecutionPlan, context: any): Promise<{
  steps: StepResult[];
  outputs: Record<number, any>;
}> {
  const results: StepResult[] = [];
  const outputs: Record<number, any> = {};

  // 按步骤顺序执行
  for (const step of plan.steps) {
    const start = Date.now();

    try {
      // 检查依赖
      if (step.dependsOn && step.dependsOn.length > 0) {
        for (const dep of step.dependsOn) {
          const depResult = results.find(r => r.step === dep);
          if (!depResult || depResult.status !== 'success') {
            if (step.optional) {
              results.push({
                step: step.step,
                description: step.description,
                status: 'skipped',
                error: '依赖步骤失败',
                duration: Date.now() - start,
              });
              continue;
            }
          }
        }
      }

      // 准备参数（可以引用前序步骤的输出）
      const params = resolveParameters(step.parameters || {}, outputs);

      // 执行
      let result: any;
      if (step.function) {
        result = await callFunction(step.function, params);
      } else {
        // 没有函数调用：直接用 LLM 处理
        result = await directLLMProcess(step.description, params, context);
      }

      outputs[step.step] = result;

      results.push({
        step: step.step,
        description: step.description,
        status: 'success',
        result,
        duration: Date.now() - start,
      });

      console.log(`[pi-internal] 步骤 ${step.step} 完成 (${Date.now() - start}ms)`);
    } catch (err: any) {
      console.error(`[pi-internal] 步骤 ${step.step} 失败:`, err.message);
      results.push({
        step: step.step,
        description: step.description,
        status: step.optional ? 'skipped' : 'failed',
        error: err.message,
        duration: Date.now() - start,
      });

      if (!step.optional) {
        // 关键步骤失败，尝试继续（除非后续都依赖）
      }
    }
  }

  return { steps: results, outputs };
}

function resolveParameters(params: any, outputs: Record<number, any>): any {
  if (typeof params === 'string') {
    // 支持 $step.N 引用前序步骤输出
    return params.replace(/\$step\.(\d+)/g, (_, n) => {
      const output = outputs[parseInt(n)];
      if (typeof output === 'string') return output;
      if (output !== undefined) return JSON.stringify(output);
      return '';
    });
  }
  if (Array.isArray(params)) {
    return params.map(p => resolveParameters(p, outputs));
  }
  if (params && typeof params === 'object') {
    const resolved: any = {};
    for (const [k, v] of Object.entries(params)) {
      resolved[k] = resolveParameters(v, outputs);
    }
    return resolved;
  }
  return params;
}

/**
 * 没有合适 worker 时，直接用 LLM 处理
 */
async function directLLMProcess(description: string, params: any, context: any): Promise<string> {
  const prompt = `${description}

参数：${JSON.stringify(params)}
上下文：${JSON.stringify(context).slice(0, 1000)}

请完成这个任务：`;

  try {
    const response = await llm.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: '你是专业助手。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });
    return response.choices[0]?.message?.content || '';
  } catch (err: any) {
    return `处理失败: ${err.message}`;
  }
}

// ============================================
// 结果汇总
// ============================================

async function synthesizeResults(task: any, plan: ExecutionPlan, execution: any): Promise<string> {
  const successfulSteps = execution.steps.filter((s: StepResult) => s.status === 'success');
  const outputsText = successfulSteps
    .map((s: StepResult) => `【步骤 ${s.step}】${s.description}\n结果：${typeof s.result === 'string' ? s.result : JSON.stringify(s.result).slice(0, 1500)}`)
    .join('\n\n');

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
    const response = await llm.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: '你是专业助手。综合所有信息给出最终答案。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 3000,
    });
    return response.choices[0]?.message?.content || '抱歉，综合处理失败。';
  } catch (err: any) {
    // 降级：直接拼接
    return outputsText || '所有步骤均失败。';
  }
}

// ============================================
// 注册 API
// ============================================

/**
 * 主入口：执行任务
 */
worker.registerFunction('execute', async (task: {
  originalQuestion: string;
  intent: string;
  domain: string;
  requirements: string[];
  history?: any[];
  attachments?: any[];
}) => {
  console.log(`[pi-internal] 接收任务: ${task.intent}`);

  // 1. 发现可用能力
  const capabilities = await discoverCapabilities();

  // 2. AI 规划
  const plan = await planExecution({
    intent: task.intent,
    domain: task.domain,
    requirements: task.requirements,
    availableCapabilities: capabilities,
  });
  console.log(`[pi-internal] 规划 ${plan.steps.length} 步`);

  // 3. 执行
  const execution = await executePlan(plan, task);

  // 4. 综合结果
  const finalAnswer = await synthesizeResults(task, plan, execution);

  return {
    finalAnswer,
    plan,
    execution,
    usedCapabilities: plan.steps
      .filter(s => s.function)
      .map(s => s.function),
  };
}, {
  name: 'pi-internal.execute',
  description: '执行任务：规划→调度→汇总',
});

/**
 * 列出所有 worker 能力
 */
worker.registerFunction('capabilities', async () => {
  const caps = await discoverCapabilities();
  return {
    count: caps.length,
    capabilities: caps,
  };
}, {
  name: 'pi-internal.capabilities',
  description: '列出所有可用 worker 能力',
});

/**
 * 健康检查
 */
worker.registerFunction('health', async () => {
  const caps = await discoverCapabilities();
  return {
    status: 'ok',
    worker: 'pi-internal',
    role: '内部调度中枢',
    model: LLM_MODEL,
    availableCapabilities: caps.length,
  };
}, {
  name: 'pi-internal.health',
  description: '健康检查',
});

console.log(`[pi-internal] 内部中枢已启动 - 模型: ${LLM_MODEL}`);
worker.start();
