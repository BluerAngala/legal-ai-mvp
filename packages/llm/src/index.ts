/**
 * @legalai/llm - 多 LLM Provider 统一客户端
 *
 * 支持 provider（OpenAI 兼容协议 + Anthropic 原生协议）：
 *   - siliconflow（默认）
 *   - openai
 *   - deepseek
 *   - ollama（本地）
 *   - anthropic（用 SDK）
 *
 * 设计：
 *   - 不持有任何默认密钥/模型名 — 由 packages/config 提供
 *   - 风险关键词/模板可注入（detectRiskKeywords 接受外部数据）
 *   - chat / streamChat / embed 三个核心方法
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { LLMError, type Logger, createLogger } from "@legalai/core";

export type LLMProvider =
	| "siliconflow"
	| "openai"
	| "anthropic"
	| "deepseek"
	| "ollama";

export interface LLMConfig {
	provider: LLMProvider;
	apiKey: string;
	baseUrl?: string;
	chatModel: string;
	embeddingModel?: string;
}

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ChatOptions {
	temperature?: number;
	maxTokens?: number;
	stop?: string[];
	jsonMode?: boolean;
	timeoutMs?: number;
}
export interface EmbeddingVector {
	index: number;
	vector: number[];
}
/* ---------- Risk Detection (无硬编码关键词) ---------- */

export interface RiskKeyword {
	keyword: string;
	level: "high" | "medium" | "low";
	desc: string;
}

export interface RiskItem {
	clause: string;
	risk_level: "high" | "medium" | "low";
	description: string;
	suggestion: string;
	keyword: string;
	offset: number;
}

/* ---------- Client ---------- */

export class LLMClient {
	private readonly cfg: LLMConfig;
	private readonly openai?: OpenAI;
	private readonly anthropic?: Anthropic;
	private readonly logger: Logger;

	constructor(cfg: LLMConfig, logger?: Logger) {
		this.cfg = cfg;
		this.logger = (logger ?? createLogger("llm")).child(cfg.provider);
		this.logger.info("LLMClient init", {
			provider: cfg.provider,
			model: cfg.chatModel,
			apiKeyPrefix: cfg.apiKey?.slice(0, 8) ?? "MISSING",
			baseUrl: cfg.baseUrl,
		});
		this.validate();
		if (cfg.provider === "anthropic") {
			this.anthropic = new Anthropic({ apiKey: cfg.apiKey });
		} else {
			this.openai = new OpenAI({
				apiKey: cfg.apiKey,
				baseURL: cfg.baseUrl,
			});
		}
	}

	/* ---------- Chat (非流式) ---------- */

	async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
		if (this.cfg.provider === "anthropic") {
			return this.chatAnthropic(messages, opts);
		}
		return this.chatOpenAI(messages, opts);
	}
	private async chatOpenAI(
		messages: ChatMessage[],
		opts: ChatOptions,
	): Promise<string> {
		const body: Record<string, unknown> = {
			model: this.cfg.chatModel,
			messages: messages.map((m) => ({ role: m.role, content: m.content })),
			temperature: opts.temperature ?? 0.3,
			max_tokens: opts.maxTokens ?? 2048,
		};
		if (opts.stop) body.stop = opts.stop;
		if (opts.jsonMode) body.response_format = { type: "json_object" };
		const url = `${this.cfg.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`;
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.cfg.apiKey}`,
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
			});
			if (!res.ok) {
				const errText = await res.text();
				throw new Error(`HTTP ${res.status}: ${errText.slice(0, 500)}`);
			}
			const data = (await res.json()) as {
				choices: Array<{ message: { content: string } }>;
			};
			const content = data.choices?.[0]?.message?.content ?? "";
			if (!content) throw new LLMError("Empty LLM response");
			return content;
		} catch (err) {
			const errAny = err as any;
			this.logger.error("chat failed", {
				err: String(err),
				errCode: errAny.cause?.code,
				errMsg: errAny.cause?.message,
				model: this.cfg.chatModel,
				url,
			});
			throw new LLMError(
				`OpenAI-compatible chat failed: ${(err as Error).message}`,
				err,
			);
		}
	}

	private async chatAnthropic(
		messages: ChatMessage[],
		opts: ChatOptions,
	): Promise<string> {
		const system = messages.find((m) => m.role === "system")?.content;
		const userMsgs = messages.filter((m) => m.role !== "system");
		try {
			const res = await this.anthropic!.messages.create({
				model: this.cfg.chatModel,
				system: system ?? "",
				messages: userMsgs.map((m) => ({
					role: m.role as "user" | "assistant",
					content: m.content,
				})),
				max_tokens: opts.maxTokens ?? 2048,
				temperature: opts.temperature ?? 0.3,
			});
			const text = res.content.find((c) => c.type === "text");
			if (!text || text.type !== "text")
				throw new LLMError("Empty Anthropic response");
			return text.text;
		} catch (err) {
			this.logger.error("anthropic chat failed", { err: String(err) });
			throw new LLMError(
				`Anthropic chat failed: ${(err as Error).message}`,
				err,
			);
		}
	}

	/* ---------- Stream Chat ---------- */

	async *streamChat(
		messages: ChatMessage[],
		opts: ChatOptions = {},
	): AsyncIterable<string> {
		if (this.cfg.provider === "anthropic") {
			yield* this.streamAnthropic(messages, opts);
			return;
		}
		yield* this.streamOpenAI(messages, opts);
	}

	private async *streamOpenAI(
		messages: ChatMessage[],
		opts: ChatOptions,
	): AsyncIterable<string> {
		try {
			const stream = await this.openai!.chat.completions.create({
				model: this.cfg.chatModel,
				messages: messages.map((m) => ({ role: m.role, content: m.content })),
				temperature: opts.temperature ?? 0.3,
				max_tokens: opts.maxTokens ?? 2048,
				stream: true,
			});
			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta?.content;
				if (delta) yield delta;
			}
		} catch (err) {
			throw new LLMError(
				`OpenAI stream failed: ${(err as Error).message}`,
				err,
			);
		}
	}

	private async *streamAnthropic(
		messages: ChatMessage[],
		opts: ChatOptions,
	): AsyncIterable<string> {
		const system = messages.find((m) => m.role === "system")?.content;
		const userMsgs = messages.filter((m) => m.role !== "system");
		try {
			const stream = await this.anthropic!.messages.stream({
				model: this.cfg.chatModel,
				system: system ?? "",
				messages: userMsgs.map((m) => ({
					role: m.role as "user" | "assistant",
					content: m.content,
				})),
				max_tokens: opts.maxTokens ?? 2048,
				temperature: opts.temperature ?? 0.3,
			});
			for await (const event of stream) {
				if (
					event.type === "content_block_delta" &&
					event.delta.type === "text_delta"
				) {
					yield event.delta.text;
				}
			}
		} catch (err) {
			throw new LLMError(
				`Anthropic stream failed: ${(err as Error).message}`,
				err,
			);
		}
	}

	/* ---------- Embedding ---------- */

	async embed(texts: string[]): Promise<EmbeddingVector[]> {
		if (this.cfg.provider === "anthropic") {
			throw new LLMError(
				"Anthropic does not provide embeddings. Configure a separate embedding provider.",
			);
		}
		if (!this.cfg.embeddingModel) {
			throw new LLMError(
				`Provider ${this.cfg.provider} requires LLM_EMBEDDING_MODEL`,
			);
		}
		try {
			const res = await this.openai!.embeddings.create({
				model: this.cfg.embeddingModel,
				input: texts,
			});
			return res.data.map((d, i) => ({
				index: i,
				vector: d.embedding as number[],
			}));
		} catch (err) {
			throw new LLMError(`Embedding failed: ${(err as Error).message}`, err);
		}
	}

	/* ---------- 风险关键词扫描（关键词从外部注入） ---------- */

	/**
	 * 在文本中扫描风险关键词。
	 * 关键词列表必须由调用方提供（数据库 / config / Skill）— 包内不持有任何默认列表。
	 */
	detectRiskKeywords(text: string, keywords: RiskKeyword[]): RiskItem[] {
		if (!keywords || keywords.length === 0) return [];
		const detected: RiskItem[] = [];
		const SENT_END = new Set(["。", "；", "!", "?", "!", "?", "\n", "\r"]);
		const SENT_START = SENT_END;

		for (const { keyword, level, desc } of keywords) {
			if (!keyword) continue;
			let searchFrom = 0;
			while (true) {
				const idx = text.indexOf(keyword, searchFrom);
				if (idx === -1) break;

				// 找所在句子的起止
				let sentenceStart = 0;
				for (let i = idx - 1; i >= 0; i--) {
					if (SENT_START.has(text[i] ?? "")) {
						sentenceStart = i + 1;
						break;
					}
				}
				let sentenceEnd = text.length;
				for (let i = idx + keyword.length; i < text.length; i++) {
					if (SENT_END.has(text[i] ?? "")) {
						sentenceEnd = i + 1;
						break;
					}
				}
				const raw = text.slice(sentenceStart, sentenceEnd).trim();
				const clause = raw || `包含「${keyword}」条款`;

				detected.push({
					clause,
					risk_level: level,
					description: desc,
					suggestion: `建议审查「${keyword}」相关条款，确保符合双方利益`,
					keyword,
					offset: idx,
				});
				searchFrom = idx + keyword.length;
			}
		}

		return detected;
	}

	/* ---------- 辅助 ---------- */

	private validate(): void {
		if (!this.cfg.apiKey) {
			throw new LLMError("LLM API key is required (set LLM_API_KEY in .env)");
		}
		if (!this.cfg.chatModel) {
			throw new LLMError(
				"LLM chat model is required (set LLM_CHAT_MODEL in .env)",
			);
		}
	}
}

/* ---------- JSON 抽取工具 ---------- */

/** 从 LLM 输出中提取 JSON（容忍 ```json 围栏、前后杂讯） */
export function extractJson<T = unknown>(text: string): T {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const candidate = fenced?.[1]?.trim() ?? text.trim();
	try {
		return JSON.parse(candidate) as T;
	} catch {
		// 找首个平衡的 JSON 块（对象或数组）
		const extracted = extractFirstBalancedJson(candidate);
		if (extracted) {
			try {
				return JSON.parse(extracted) as T;
			} catch (err) {
				throw new LLMError(
					`Cannot parse extracted JSON: ${(err as Error).message}`,
				);
			}
		}
		throw new LLMError(
			`Cannot extract JSON from LLM output: ${text.slice(0, 200)}`,
		);
	}
}

/** 在字符串中找到首个平衡的 {...} 或 [...] 块（含嵌套） */
function extractFirstBalancedJson(s: string): string | null {
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch !== "{" && ch !== "[") continue;
		const open = ch;
		const close = open === "{" ? "}" : "]";
		let depth = 0;
		let inStr = false;
		let esc = false;
		for (let j = i; j < s.length; j++) {
			const c = s[j];
			if (inStr) {
				if (esc) {
					esc = false;
					continue;
				}
				if (c === "\\") {
					esc = true;
					continue;
				}
				if (c === '"') inStr = false;
				continue;
			}
			if (c === '"') {
				inStr = true;
				continue;
			}
			if (c === open) depth++;
			else if (c === close) {
				depth--;
				if (depth === 0) return s.slice(i, j + 1);
			}
		}
	}
	return null;
}

/* ---------- 单例 ---------- */

let _client: LLMClient | null = null;
export function getLLMClient(cfg?: LLMConfig): LLMClient {
	if (!_client && cfg) _client = new LLMClient(cfg);
	if (!_client)
		throw new LLMError(
			"LLMClient not initialized — call getLLMClient(cfg) first",
		);
	return _client;
}
export function resetLLMClient(): void {
	_client = null;
}
