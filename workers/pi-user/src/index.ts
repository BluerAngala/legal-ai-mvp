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
 */

import { registerWorker, callFunction } from 'iii-sdk';
import OpenAI from 'openai';

const LLM_API_KEY = process.env.LLM_API_KEY || 'sk-crwfmfqcogblddlpymiqqaatuepooklkjdelsxephytdswwe';
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.siliconflow.cn/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'Pro/MiniMaxAI/MiniMax-M2.5';

const llm = new OpenAI({
  apiKey: LLM_API_KEY,
  baseURL: LLM_BASE_URL,
});

const worker = registerWorker('pi-user');

/**
 * Step 1: 理解用户需求（不预设类别）
 */
async function understandUserNeed(input: {
  question: string;
  history?: Array<{ role: string; content: string }>;
  attachments?: any[];
}): Promise<{
  intent: string;
  domain: string;
  requirements: string[];
  clarifyingQuestions: string[];
}> {
  const historyText = (input.history || [])
    .map(h => `${h.role}: ${h.content}`)
    .join('\n');

  const prompt = `你是一个需求理解专家。分析用户的真实需求。

${historyText ? `对话历史：\n${historyText}\n` : ''}
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
    const response = await llm.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: '你是需求理解专家。返回纯 JSON。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error('[pi-user] 需求理解失败:', err);
  }

  // 降级：基础理解
  return {
    intent: input.question,
    domain: '未分类',
    requirements: [input.question],
    clarifyingQuestions: [],
  };
}

/**
 * Step 2: 委派给 pi-internal
 */
async function delegateToInternal(task: {
  originalQuestion: string;
  intent: string;
  domain: string;
  requirements: string[];
  history?: any[];
  attachments?: any[];
}): Promise<any> {
  try {
    const result = await callFunction('pi-internal.execute', task);
    return result;
  } catch (err: any) {
    console.error('[pi-user] 委派失败:', err);
    return {
      error: '内部调度失败',
      message: err.message,
      fallback: task.originalQuestion,
    };
  }
}

/**
 * Step 3: 将内部结果转化为用户友好的回复
 */
async function formatForUser(
  originalQuestion: string,
  understanding: any,
  internalResult: any
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
    const response = await llm.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: '你是一个专业、友好的用户助手。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 2500,
    });

    return response.choices[0]?.message?.content || '抱歉，我暂时无法回答您的问题。';
  } catch (err: any) {
    // 降级：直接展示原始结果
    if (internalResult?.fallback) {
      return `抱歉，处理您的问题时遇到问题：${err.message}\n\n您的问题已记录：${internalResult.fallback}`;
    }
    return `处理结果：\n${JSON.stringify(internalResult, null, 2)}`;
  }
}

// ============================================
// 注册 API
// ============================================

/**
 * 主入口：处理用户问题（完全通用）
 */
worker.registerFunction('ask', async (input: {
  question: string;
  history?: Array<{ role: string; content: string }>;
  attachments?: any[];
}) => {
  console.log(`[pi-user] 收到问题: ${input.question}`);

  // 1. 理解需求
  const understanding = await understandUserNeed(input);
  console.log('[pi-user] 理解:', understanding);

  // 2. 委派给内部
  const internalResult = await delegateToInternal({
    originalQuestion: input.question,
    intent: understanding.intent,
    domain: understanding.domain,
    requirements: understanding.requirements,
    history: input.history,
    attachments: input.attachments,
  });

  // 3. 友好化输出
  const answer = await formatForUser(input.question, understanding, internalResult);

  return {
    answer,
    understanding,
    internal: internalResult,
  };
}, {
  name: 'pi-user.ask',
  description: '处理任意用户问题（通用入口）',
});

/**
 * 流式对话支持
 */
worker.registerFunction('chat', async (input: {
  messages: Array<{ role: string; content: string }>;
}) => {
  // 提取最后一轮问题
  const lastUserMessage = [...input.messages].reverse().find(m => m.role === 'user');
  const question = lastUserMessage?.content || '';

  return worker.callFunction('pi-user.ask', {
    question,
    history: input.messages.slice(0, -1),
  });
}, {
  name: 'pi-user.chat',
  description: '多轮对话',
});

/**
 * 健康检查
 */
worker.registerFunction('health', async () => {
  return {
    status: 'ok',
    worker: 'pi-user',
    role: '用户中枢',
    model: LLM_MODEL,
    capabilities: ['通用问题理解', '多轮对话', '友好化输出'],
  };
}, {
  name: 'pi-user.health',
  description: '健康检查',
});

console.log(`[pi-user] 用户中枢已启动 - 模型: ${LLM_MODEL}`);
worker.start();
