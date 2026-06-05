import { describe, expect, it } from "vitest";
import { chunkText, normalizeWhitespace } from "./index.js";

describe("chunkText", () => {
	it("returns empty for empty text", () => {
		expect(chunkText("")).toEqual([]);
	});

	it("returns single chunk for short text", () => {
		const text = "短的合同文本。";
		const chunks = chunkText(text, { chunkSize: 100 });
		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.text).toBe(text);
	});

	it("splits long text into multiple chunks", () => {
		const text = "A".repeat(2000);
		const chunks = chunkText(text, { chunkSize: 500, overlap: 50 });
		expect(chunks.length).toBeGreaterThan(1);
		// 检查每块不超过 chunkSize + 一点点
		for (const c of chunks) {
			expect(c.text.length).toBeLessThanOrEqual(500);
		}
	});

	it("respects separator", () => {
		const text = "第一段。\n\n第二段。\n\n第三段。";
		const chunks = chunkText(text, {
			chunkSize: 10,
			overlap: 0,
			separator: "\n\n",
		});
		expect(chunks.length).toBeGreaterThanOrEqual(1);
	});

	it("preserves monotonic offsets", () => {
		const text = "段落一。\n\n段落二。\n\n段落三。\n\n段落四。";
		const chunks = chunkText(text, {
			chunkSize: 6,
			overlap: 0,
			separator: "\n\n",
		});
		for (let i = 1; i < chunks.length; i++) {
			expect(chunks[i]?.startChar ?? 0).toBeGreaterThanOrEqual(
				(chunks[i - 1]?.endChar ?? 0) - 0,
			);
		}
	});
});

describe("normalizeWhitespace (private but tested via parseDocument fallback)", () => {
	it("reduces multi-blank lines", () => {
		const input = "A\n\n\n\n\nB";
		const out = normalizeWhitespace(input);
		expect(out).toBe("A\n\nB");
	});

	it("replaces non-breaking space", () => {
		const input = "A B";
		const out = normalizeWhitespace(input);
		expect(out).toBe("A B");
	});
});
