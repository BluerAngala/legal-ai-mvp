/**
 * @legalai/core - 共享类型 + Logger + 错误
 *
 * 设计原则：纯类型 + 零外部副作用，便于 workers/desktop 共用
 */

import { z } from "zod";

/* ---------- Logger ---------- */

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVELS: Record<LogLevel, number> = {
	trace: 10,
	debug: 20,
	info: 30,
	warn: 40,
	error: 50,
	fatal: 60,
};

export interface LoggerOptions {
	level?: LogLevel;
	pretty?: boolean;
	service?: string;
}

export class Logger {
	private readonly level: number;
	private readonly pretty: boolean;
	private readonly service: string;

	constructor(opts: LoggerOptions = {}) {
		this.level = LOG_LEVELS[opts.level ?? "info"];
		this.pretty = opts.pretty ?? false;
		this.service = opts.service ?? "legalai";
	}

	child(subservice: string): Logger {
		return new Logger({
			level: this.levelToString(this.level),
			pretty: this.pretty,
			service: `${this.service}:${subservice}`,
		});
	}

	trace(msg: string, meta?: Record<string, unknown>): void {
		this.log("trace", msg, meta);
	}
	debug(msg: string, meta?: Record<string, unknown>): void {
		this.log("debug", msg, meta);
	}
	info(msg: string, meta?: Record<string, unknown>): void {
		this.log("info", msg, meta);
	}
	warn(msg: string, meta?: Record<string, unknown>): void {
		this.log("warn", msg, meta);
	}
	error(msg: string, meta?: Record<string, unknown>): void {
		this.log("error", msg, meta);
	}
	fatal(msg: string, meta?: Record<string, unknown>): void {
		this.log("fatal", msg, meta);
	}

	private log(
		level: LogLevel,
		msg: string,
		meta?: Record<string, unknown>,
	): void {
		if (LOG_LEVELS[level] < this.level) return;
		const record = {
			ts: new Date().toISOString(),
			level,
			service: this.service,
			msg,
			...meta,
		};
		const out = this.pretty
			? `[${record.ts}] ${level.toUpperCase()} (${this.service}) ${msg} ${meta ? JSON.stringify(meta) : ""}`
			: JSON.stringify(record);
		if (level === "error" || level === "fatal") {
			console.error(out);
		} else {
			console.log(out);
		}
	}

	private levelToString(n: number): LogLevel {
		const entry = Object.entries(LOG_LEVELS).find(([, v]) => v === n);
		return (entry?.[0] ?? "info") as LogLevel;
	}
}

/** 默认 logger，按 env LOG_LEVEL */
export function createLogger(service: string): Logger {
	return new Logger({
		level: (process.env.LOG_LEVEL as LogLevel) ?? "info",
		pretty: process.env.LOG_PRETTY === "true",
		service,
	});
}

/* ---------- 错误类型 ---------- */

export class LegalAIError extends Error {
	constructor(
		public readonly code: string,
		message: string,
		public readonly cause?: unknown,
		public readonly meta?: Record<string, unknown>,
	) {
		super(message);
		this.name = "LegalAIError";
	}

	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			code: this.code,
			message: this.message,
			meta: this.meta,
		};
	}
}

export class ConfigError extends LegalAIError {
	constructor(message: string, meta?: Record<string, unknown>) {
		super("CONFIG_ERROR", message, undefined, meta);
		this.name = "ConfigError";
	}
}

export class LLMError extends LegalAIError {
	constructor(
		message: string,
		cause?: unknown,
		meta?: Record<string, unknown>,
	) {
		super("LLM_ERROR", message, cause, meta);
		this.name = "LLMError";
	}
}

export class SearchError extends LegalAIError {
	constructor(
		message: string,
		cause?: unknown,
		meta?: Record<string, unknown>,
	) {
		super("SEARCH_ERROR", message, cause, meta);
		this.name = "SearchError";
	}
}

export class WorkerError extends LegalAIError {
	constructor(workerName: string, message: string, cause?: unknown) {
		super("WORKER_ERROR", `[${workerName}] ${message}`, cause, { workerName });
		this.name = "WorkerError";
	}
}

/* ---------- 共享 Trace 类型 ---------- */

/** 单步 trace：pi-user/pi-internal/knowledge/analysis/docgen/document 都会产出 */
export interface TraceStep {
	worker: string;
	action: string;
	startedAt: string; // ISO
	endedAt?: string; // ISO
	status: "running" | "success" | "error" | "skipped";
	input?: unknown;
	output?: unknown;
	error?: { code: string; message: string };
	durationMs?: number;
}

/* ---------- 共享领域类型 ---------- */

export const LegalDomainSchema = z.enum([
	"general",
	"labor", // 劳动纠纷
	"marriage", // 婚姻家庭
	"contract", // 合同纠纷
	"traffic", // 交通事故
	"criminal", // 刑事
	"property", // 房产
	"inheritance", // 继承
	"corporate", // 公司法
]);
export type LegalDomain = z.infer<typeof LegalDomainSchema>;

/** 统一 ask 请求：桌面 → pi-user */
export const AskRequestSchema = z.object({
	query: z.string().min(1),
	domain: LegalDomainSchema.optional(),
	history: z
		.array(
			z.object({
				role: z.enum(["user", "assistant"]),
				content: z.string(),
			}),
		)
		.optional(),
	collectionId: z.string().optional(),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;

export const AskResponseSchema = z.object({
	answer: z.string(),
	domain: LegalDomainSchema,
	confidence: z.number().min(0).max(1),
	citations: z.array(
		z.object({
			articleId: z.string().optional(),
			source: z.string(),
			snippet: z.string(),
			score: z.number(),
		}),
	),
	trace: z.array(z.any()), // TraceStep[]
	suggestions: z.array(z.string()).optional(),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;

/* ---------- Worker 健康检查 ---------- */

export interface WorkerHealth {
	name: string;
	ok: boolean;
	version: string;
	uptimeSec: number;
	checks: Record<string, { ok: boolean; detail?: string; latencyMs?: number }>;
}

/* ---------- 工具函数 ---------- */

export function nowIso(): string {
	return new Date().toISOString();
}

export function elapsedMs(
	startedAt: string,
	endedAt: string = nowIso(),
): number {
	return new Date(endedAt).getTime() - new Date(startedAt).getTime();
}

/** 安全 JSON 序列化（处理 BigInt、循环引用） */
export function safeJson(value: unknown, indent?: number): string {
	const seen = new WeakSet();
	return JSON.stringify(
		value,
		(_k, v) => {
			if (typeof v === "bigint") return v.toString();
			if (typeof v === "object" && v !== null) {
				if (seen.has(v as object)) return "[Circular]";
				seen.add(v as object);
			}
			return v;
		},
		indent,
	);
}

/**
 * 解包 iii HTTP 触发器的 ApiRequest
 * - WebSocket 调用：直接传 raw data
 * - HTTP 触发器：传 { body, path, query_params, path_params, headers, ... }
 *
 * 本函数检测 shape，自动解包 body/path/query
 */
export function unwrapApiRequest<T = Record<string, any>>(
	input: T | { body?: T; path_params?: Record<string, string>; query_params?: Record<string, string> }
): T {
	if (input && typeof input === "object" && !Array.isArray(input)) {
		const obj = input as Record<string, unknown>;
		// HTTP POST: 优先用 body
		if ("body" in obj) {
			const merged: Record<string, unknown> = {
				...((obj.body as Record<string, unknown>) ?? {}),
			};
			// 把 path_params 合并进来（GET /:id 类的端点）
			if (obj.path_params && typeof obj.path_params === "object") {
				Object.assign(merged, obj.path_params);
			}
			// 把 query_params 合并进来（GET ?limit=20 类的端点）
			if (obj.query_params && typeof obj.query_params === "object") {
				Object.assign(merged, obj.query_params);
			}
			// 兼容：HTTP 路径 /:id 提取为 'id'，但 worker 通常用 'documentId'/'templateId' 等
			if ("id" in merged && !("documentId" in merged) && !("templateId" in merged)) {
				merged.documentId = merged.id;
			}
			return merged as T;
		}
		// WebSocket / 直接调用：直接返回
		return input as T;
	}
	return input as T;
}

/**
 * 包装 worker 返回值为 HTTP 响应格式
 *
 * 引擎的 HTTP API 期望返回值形如：{ status_code, body }
 * 详见 engine/src/workers/rest_api/views.rs 的 FunctionResult::Success 处理
 *
 * - 如果返回值已经有 status_code 字段，直接返回（视为已包装）
 * - 否则把整个返回值包成 { status_code: 200, body: 原值 }
 */
export function wrapApiResponse<T = unknown, I = unknown>(
	handler: (input: I) => Promise<T> | T
): (input: I) => Promise<{ status_code: number; body: T }> {
	return async (input: I) => {
		const result = await handler(input);
		if (
			result &&
			typeof result === "object" &&
			!Array.isArray(result) &&
			"status_code" in (result as Record<string, unknown>)
		) {
			return result as unknown as { status_code: number; body: T };
		}
		return { status_code: 200, body: result };
	};
}
