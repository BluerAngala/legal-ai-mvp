/**
 * @legalai/api - 桌面端统一 API 客户端
 *
 * 通过 HTTP 调用 iii worker 注册的 `/api/...` 端点
 * 不再使用 Tauri invoke（业务已迁出至 worker）
 *
 * Engine HTTP 默认端口: 3111（可由 VITE_API_BASE 覆盖）
 */

const API_BASE =
	(typeof import.meta !== "undefined" &&
		(import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE) ??
	"http://localhost:3111";

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
		public body?: unknown,
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const url = `${API_BASE}${path}`;
	const res = await fetch(url, {
		...init,
		headers: {
			"Content-Type": "application/json",
			...init.headers,
		},
	});

	if (!res.ok) {
		let body: unknown;
		try {
			body = await res.json();
		} catch {
			body = await res.text();
		}
		throw new ApiError(
			res.status,
			`API ${res.status} ${res.statusText} for ${path}`,
			body,
		);
	}

	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

function qs(
	params: Record<string, string | number | undefined | null>,
): string {
	const search = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v !== undefined && v !== null) search.set(k, String(v));
	}
	const s = search.toString();
	return s ? `?${s}` : "";
}

// ============================================
// Upload Worker — 文档上传
// 返回字段：id, filename, mime_type, size, checksum, status, created_at
// ============================================
export const upload = {
	list: (limit = 20, offset = 0) =>
		request<UploadItem[]>(`/api/documents${qs({ limit, offset })}`),

	get: (id: string) => request<UploadItem>(`/api/documents/${id}`),

	delete: (id: string) =>
		request<void>(`/api/documents/${id}`, { method: "DELETE" }),

	create: (formData: FormData) =>
		request<UploadItem>(`/api/documents/upload`, {
			method: "POST",
			body: formData,
			headers: {},
		}),
};

// ============================================
// Document Worker — 文档解析
// ============================================
export const document = {
	parse: (id: string) =>
		request<ParseResult>(`/api/documents/${id}/parse`, { method: "POST" }),

	status: (id: string) => request<ParseStatus>(`/api/documents/${id}/status`),
};

// ============================================
// Knowledge Worker — 检索
// 返回字段：chunk_id, document_id, content, score, snippet?
// ============================================
export const knowledge = {
	search: (query: string, limit = 20) =>
		request<SearchResponse>(`/api/search`, {
			method: "POST",
			body: JSON.stringify({ query, limit }),
		}),

	reindex: () =>
		request<{ started: boolean }>(`/api/search/reindex`, { method: "POST" }),

	health: () => request<HealthStatus>(`/api/search/health`),
};

// ============================================
// Analysis Worker — LLM 分析
// 返回字段：summary?, risks?, confidence?, answer?
// ============================================
export const analysis = {
	riskReview: (documentId: string) =>
		request<AnalysisResult>(`/api/analysis/risk-review`, {
			method: "POST",
			body: JSON.stringify({ documentId }),
		}),

	summarize: (documentId: string) =>
		request<AnalysisResult>(`/api/analysis/summarize`, {
			method: "POST",
			body: JSON.stringify({ documentId }),
		}),

	qa: (documentId: string, question: string) =>
		request<AnalysisResult>(`/api/analysis/qa`, {
			method: "POST",
			body: JSON.stringify({ documentId, question }),
		}),

	clauseCompare: (documentIdA: string, documentIdB: string) =>
		request<AnalysisResult>(`/api/analysis/clause-compare`, {
			method: "POST",
			body: JSON.stringify({ documentIdA, documentIdB }),
		}),
};

// ============================================
// Docgen Worker — 模板/文档生成
// 模板字段：id, name, category, content, variables, description?
// ============================================
export const docgen = {
	listTemplates: (category?: string) =>
		request<Template[]>(`/api/templates${qs({ category })}`),

	getTemplate: (id: string) => request<Template>(`/api/templates/${id}`),

	createTemplate: (template: TemplateInput) =>
		request<Template>(`/api/templates`, {
			method: "POST",
			body: JSON.stringify(template),
		}),

	generate: (templateId: string, variables: Record<string, string>) =>
		request<GeneratedDocument>(`/api/docgen/generate`, {
			method: "POST",
			body: JSON.stringify({ templateId, variables }),
		}),

	exportUrl: (id: string, format: "markdown" | "html" | "docx" = "markdown") =>
		`${API_BASE}/api/docgen/export/${id}?format=${format}`,
};

// ============================================
// Pi-User Worker — 问答/聊天
// 返回字段：answer, sources?, usage?
// ============================================
export const ask = {
	ask: (question: string, context?: { documentId?: string }) =>
		request<AskResponse>(`/api/ask`, {
			method: "POST",
			body: JSON.stringify({ question, ...context }),
		}),

	chat: (messages: ChatMessage[]) =>
		request<AskResponse>(`/api/chat`, {
			method: "POST",
			body: JSON.stringify({ messages }),
		}),

	health: () => request<HealthStatus>(`/api/ask/health`),
};

// ============================================
// Pi-Internal Worker — 内部能力
// ============================================
export const internal = {
	execute: (plan: ExecutionPlan) =>
		request<ExecutionResult>(`/api/internal/execute`, {
			method: "POST",
			body: JSON.stringify(plan),
		}),

	capabilities: () => request<CapabilityList>(`/api/internal/capabilities`),

	health: () => request<HealthStatus>(`/api/internal/health`),
};

// ============================================
// Types — 与 worker 真实 schema 对齐
// ============================================
export interface UploadItem {
	id: string;
	filename: string;
	mime_type: string;
	size: number;
	checksum?: string;
	status: "processing" | "parsed" | "indexed" | "error";
	created_at: string;
}

export interface ParseResult {
	documentId: string;
	chunks: number;
	embeddings: number;
	duration_ms: number;
}

export interface ParseStatus {
	documentId: string;
	status: "processing" | "parsed" | "indexed" | "error";
	chunks: number;
	error?: string;
}

export interface SearchResponse {
	results: SearchResult[];
	total: number;
	took_ms: number;
}

export interface SearchResult {
	chunk_id: string;
	document_id: string;
	content: string;
	score: number;
	snippet?: string;
	metadata?: Record<string, unknown>;
	// 兼容字段（页面旧代码使用）
	id?: string;
	title?: string;
}

export interface AnalysisResult {
	summary?: string;
	risks?: RiskItem[];
	confidence?: number;
	answer?: string;
	[key: string]: unknown;
}

export interface RiskItem {
	clause: string;
	risk_level: "high" | "medium" | "low";
	description: string;
	suggestion: string;
	keyword?: string;
	offset?: number;
}

export interface Template {
	id: string;
	name: string;
	category: "contract" | "letter" | "report" | "brief";
	description?: string;
	content: string;
	variables: TemplateVariable[];
}

export interface TemplateVariable {
	name: string;
	label: string;
	required?: boolean;
	type?: "text" | "number" | "date" | "select";
	options?: string[];
}

export interface TemplateInput {
	name: string;
	category: Template["category"];
	content: string;
	description?: string;
	variables?: TemplateVariable[];
}

export interface GeneratedDocument {
	id: string;
	template_id: string;
	content: string;
	format: "markdown" | "html" | "docx";
	metadata: Record<string, unknown>;
}

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface AskResponse {
	answer: string;
	sources?: { document_id: string; snippet: string }[];
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
	// 兼容字段（页面旧代码使用）
	understanding?: {
		intent?: string;
		domain?: string;
		entities?: Record<string, string>;
	};
	confidence?: number;
}

export interface HealthStatus {
	ok: boolean;
	version?: string;
	uptime_sec?: number;
	dependencies?: Record<string, "ok" | "degraded" | "down">;
}

export interface ExecutionPlan {
	steps: { function_id: string; input: unknown }[];
}

export interface ExecutionResult {
	steps: {
		function_id: string;
		output: unknown;
		duration_ms: number;
		error?: string;
	}[];
	total_ms: number;
}

export interface CapabilityList {
	functions: { id: string; description: string }[];
	updated_at: string;
}
