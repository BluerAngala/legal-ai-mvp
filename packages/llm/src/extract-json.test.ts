import { describe, expect, it } from "vitest";
import { extractJson } from "./index.js";

describe("extractJson", () => {
	it("parses plain JSON", () => {
		const result = extractJson<{ a: number }>('{"a":1}');
		expect(result.a).toBe(1);
	});

	it("parses ```json fenced JSON", () => {
		const text = '```json\n{"domain":"labor","score":0.9}\n```';
		const result = extractJson<{ domain: string; score: number }>(text);
		expect(result.domain).toBe("labor");
		expect(result.score).toBe(0.9);
	});

	it("parses JSON with surrounding noise", () => {
		const text = '以下是结果：\n{"x":42}\n完毕。';
		const result = extractJson<{ x: number }>(text);
		expect(result.x).toBe(42);
	});

	it("parses JSON array", () => {
		const text = '结果：[{"a":1},{"a":2}]';
		const result = extractJson<Array<{ a: number }>>(text);
		expect(result).toHaveLength(2);
	});

	it("throws on invalid JSON", () => {
		expect(() => extractJson("not json at all")).toThrow();
	});
});
