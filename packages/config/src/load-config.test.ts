import { describe, expect, it, beforeEach } from "vitest";
import { loadConfig, resetConfigCache } from "./index.js";

const validEnv = {
	NODE_ENV: "test",
	POSTGRES_HOST: "localhost",
	POSTGRES_PORT: "5432",
	POSTGRES_DB: "legalai_test",
	POSTGRES_USER: "postgres",
	POSTGRES_PASSWORD: "test",
	LLM_PROVIDER: "siliconflow",
	LLM_API_KEY: "sk-test",
	LLM_CHAT_MODEL: "test-model",
	LLM_EMBEDDING_MODEL: "test-emb",
	III_ENGINE_URL: "ws://localhost:49134",
	WORKER_NAME: "test-worker",
	LOG_LEVEL: "info",
	LOG_PRETTY: "false",
};

beforeEach(() => resetConfigCache());

describe("loadConfig", () => {
	it("loads valid env", () => {
		const cfg = loadConfig(validEnv);
		expect(cfg.llm.provider).toBe("siliconflow");
		expect(cfg.llm.apiKey).toBe("sk-test");
		expect(cfg.database.host).toBe("localhost");
		expect(cfg.engine.workerName).toBe("test-worker");
	});

	it("throws on missing LLM_API_KEY", () => {
		const env = { ...validEnv, LLM_API_KEY: undefined };
		expect(() => loadConfig(env as unknown as NodeJS.ProcessEnv)).toThrow(
			/llm.apiKey/,
		);
	});

	it("throws on missing POSTGRES_PASSWORD", () => {
		const env = { ...validEnv, POSTGRES_PASSWORD: undefined };
		expect(() => loadConfig(env as unknown as NodeJS.ProcessEnv)).toThrow(
			/password/,
		);
	});

	it("throws on missing III_ENGINE_URL", () => {
		const env = {
			...validEnv,
			III_ENGINE_URL: undefined,
			ENGINE_URL: undefined,
		};
		expect(() => loadConfig(env as unknown as NodeJS.ProcessEnv)).toThrow(
			/engine/,
		);
	});

	it("throws on invalid LLM_PROVIDER enum", () => {
		const env = { ...validEnv, LLM_PROVIDER: "unknown" };
		expect(() => loadConfig(env as unknown as NodeJS.ProcessEnv)).toThrow();
	});

	it("caches result", () => {
		const a = loadConfig(validEnv);
		const b = loadConfig(validEnv);
		expect(a).toBe(b);
	});

	it("resetConfigCache clears cache", () => {
		const a = loadConfig(validEnv);
		resetConfigCache();
		const b = loadConfig(validEnv);
		expect(a).not.toBe(b);
		expect(a.llm.apiKey).toBe(b.llm.apiKey);
	});
});
