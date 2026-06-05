import { describe, expect, it } from "vitest";
import {
	Logger,
	createLogger,
	safeJson,
	elapsedMs,
	nowIso,
	LegalAIError,
} from "./index.js";

describe("Logger", () => {
	it("respects level threshold", () => {
		const captured: string[] = [];
		const origLog = console.log;
		const origErr = console.error;
		console.log = (msg: string) => captured.push(msg);
		console.error = (msg: string) => captured.push(msg);

		const logger = new Logger({ level: "warn", service: "test" });
		logger.info("should not log");
		logger.warn("should log");
		logger.error("should log");

		console.log = origLog;
		console.error = origErr;
		expect(captured).toHaveLength(2);
		expect(captured[0]).toContain("warn");
		expect(captured[1]).toContain("error");
	});

	it("child logger prefixes service name", () => {
		const captured: string[] = [];
		const origLog = console.log;
		console.log = (msg: string) => captured.push(msg);

		const parent = createLogger("parent");
		const child = parent.child("child");
		child.info("hello");

		console.log = origLog;
		expect(captured[0]).toContain("parent:child");
	});
});

describe("safeJson", () => {
	it("serializes BigInt", () => {
		const out = safeJson({ n: 1n });
		expect(out).toBe('{"n":"1"}');
	});

	it("handles circular references", () => {
		const obj: Record<string, unknown> = { a: 1 };
		obj["self"] = obj;
		const out = safeJson(obj);
		expect(out).toContain("[Circular]");
	});

	it("respects indent", () => {
		const out = safeJson({ a: 1 }, 2);
		expect(out).toContain("\n");
	});
});

describe("elapsedMs", () => {
	it("returns positive duration", () => {
		const start = nowIso();
		const dur = elapsedMs(start);
		expect(dur).toBeGreaterThanOrEqual(0);
	});
});

describe("LegalAIError", () => {
	it("serializes to JSON", () => {
		const err = new LegalAIError("CODE_X", "something failed", undefined, {
			x: 1,
		});
		const json = err.toJSON();
		expect(json["code"]).toBe("CODE_X");
		expect(json["meta"]).toEqual({ x: 1 });
	});
});
