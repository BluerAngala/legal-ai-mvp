/**
 * @legalai/config - 统一环境变量加载
 *
 * 设计原则：
 * 1. 零默认值 — 缺关键配置 fail-fast，避免硬编码密钥/连接串
 * 2. 单一入口 — loadConfig() 返回强类型 Config
 * 3. 校验前置 — Zod 校验，错误信息明确
 * 4. 分层读取 — process.env > .env 文件（dotenv 在 worker 入口加载）
 */

import { z } from "zod";

/* ---------- LLM Provider Schema ---------- */

const LLMProviderSchema = z.enum([
	"siliconflow",
	"openai",
	"anthropic",
	"deepseek",
	"ollama",
]);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

/* ---------- 子 Schema ---------- */

const DatabaseSchema = z.object({
	url: z.string().url(),
	host: z.string().min(1),
	port: z.coerce.number().int().positive(),
	database: z.string().min(1),
	user: z.string().min(1),
	password: z.string().min(1),
	poolMax: z.coerce.number().int().positive().default(10),
});

const RedisSchema = z.object({
	url: z.string().url().optional(),
	host: z.string().min(1).default("localhost"),
	port: z.coerce.number().int().positive().default(6379),
	password: z.string().optional(),
	ttlSeconds: z.coerce.number().int().positive().default(3600),
});

const LLMProviderConfigSchema = z.object({
	provider: LLMProviderSchema,
	apiKey: z.string().min(1),
	baseUrl: z.string().url().optional(),
	chatModel: z.string().min(1),
	embeddingModel: z.string().min(1),
});

const EngineSchema = z.object({
	url: z.string().url(),
	workerName: z.string().min(1),
});

const ServerSchema = z.object({
	host: z.string().default("0.0.0.0"),
	port: z.coerce.number().int().positive().default(3111),
	uploadMaxMb: z.coerce.number().int().positive().default(50),
	enableSwagger: z.coerce.boolean().default(true),
});

const LoggingSchema = z.object({
	level: z
		.enum(["trace", "debug", "info", "warn", "error", "fatal"])
		.default("info"),
	pretty: z.coerce.boolean().default(false),
});

const StorageSchema = z.object({
	uploadDir: z.string().min(1).default("./uploads"),
	// 是否启用本地 SQLite 缓存（桌面端）
	enableLocalCache: z.coerce.boolean().default(false),
	localCachePath: z.string().optional(),
});

/* ---------- 顶层 Schema ---------- */

const ConfigSchema = z.object({
	nodeEnv: z.enum(["development", "production", "test"]).default("development"),
	database: DatabaseSchema,
	redis: RedisSchema,
	llm: LLMProviderConfigSchema,
	engine: EngineSchema,
	server: ServerSchema,
	logging: LoggingSchema,
	storage: StorageSchema,
});

export type Config = z.infer<typeof ConfigSchema>;

/* ---------- 加载器 ---------- */

let cached: Config | null = null;

/**
 * 从 env 构建 Config。env 缺失会抛出 ZodError。
 * 多次调用返回同一实例（缓存）。
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	if (cached) return cached;

	const raw = {
		nodeEnv: env.NODE_ENV,
		database: {
			url: env.DATABASE_URL ?? buildPostgresUrl(env),
			host: env.POSTGRES_HOST,
			port: env.POSTGRES_PORT,
			database: env.POSTGRES_DB,
			user: env.POSTGRES_USER,
			password: env.POSTGRES_PASSWORD,
			poolMax: env.POSTGRES_POOL_MAX,
		},
		redis: {
			url: env.REDIS_URL,
			host: env.REDIS_HOST,
			port: env.REDIS_PORT,
			password: env.REDIS_PASSWORD,
			ttlSeconds: env.REDIS_TTL_SECONDS,
		},
		llm: {
			provider: env.LLM_PROVIDER,
			apiKey: env.LLM_API_KEY,
			baseUrl: env.LLM_BASE_URL,
			chatModel: env.LLM_CHAT_MODEL ?? env.LLM_MODEL,
			embeddingModel: env.LLM_EMBEDDING_MODEL,
		},
		engine: {
			url: env.III_ENGINE_URL ?? env.ENGINE_URL,
			workerName: env.WORKER_NAME ?? "unknown-worker",
		},
		server: {
			host: env.SERVER_HOST,
			port: env.SERVER_PORT,
			uploadMaxMb: env.UPLOAD_MAX_MB,
			enableSwagger: env.ENABLE_SWAGGER,
		},
		logging: {
			level: env.LOG_LEVEL,
			pretty: env.LOG_PRETTY,
		},
		storage: {
			uploadDir: env.UPLOAD_DIR,
			enableLocalCache: env.ENABLE_LOCAL_CACHE,
			localCachePath: env.LOCAL_CACHE_PATH,
		},
	};

	const parsed = ConfigSchema.safeParse(raw);
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
			.join("\n");
		throw new Error(
			`[config] Invalid environment configuration:\n${issues}\n\nSee .env.example for required variables.`,
		);
	}

	cached = parsed.data;
	return cached;
}

/** 测试用：清除缓存 */
export function resetConfigCache(): void {
	cached = null;
}

/* ---------- 内部工具 ---------- */

function buildPostgresUrl(env: NodeJS.ProcessEnv): string | undefined {
	const host = env.POSTGRES_HOST;
	const port = env.POSTGRES_PORT ?? "5432";
	const db = env.POSTGRES_DB;
	const user = env.POSTGRES_USER;
	const pwd = env.POSTGRES_PASSWORD;
	if (!host || !db || !user || !pwd) return undefined;
	return `postgresql://${user}:${pwd}@${host}:${port}/${db}`;
}

/* ---------- LLM Provider 预设 ---------- */

export const LLM_PROVIDER_PRESETS: Record<
	LLMProvider,
	{ baseUrl: string; chat: string; embedding: string }
> = {
	siliconflow: {
		baseUrl: "https://api.siliconflow.cn/v1",
		chat: "Pro/MiniMaxAI/MiniMax-M2.5",
		embedding: "BAAI/bge-m3",
	},
	openai: {
		baseUrl: "https://api.openai.com/v1",
		chat: "gpt-4o",
		embedding: "text-embedding-3-small",
	},
	anthropic: {
		baseUrl: "https://api.anthropic.com",
		chat: "claude-3-5-sonnet-20241022",
		embedding: "",
	},
	deepseek: {
		baseUrl: "https://api.deepseek.com/v1",
		chat: "deepseek-chat",
		embedding: "",
	},
	ollama: {
		baseUrl: "http://localhost:11434",
		chat: "llama3.1",
		embedding: "nomic-embed-text",
	},
};

/** 应用 LLM Provider 预设：当用户未指定 baseUrl/embedding 时使用 */
export function applyLLMPreset(cfg: Config): Config {
	const preset = LLM_PROVIDER_PRESETS[cfg.llm.provider];
	return {
		...cfg,
		llm: {
			...cfg.llm,
			baseUrl: cfg.llm.baseUrl ?? preset.baseUrl,
			embeddingModel: cfg.llm.embeddingModel || preset.embedding,
		},
	};
}
