import { describe, expect, it, beforeEach } from "vitest";
import {
	BM25,
	HybridSearch,
	rrfFuse,
	SemanticEngine,
	tokenize,
} from "./index.js";
import type { SearchDoc, SearchHit } from "./index.js";

describe("tokenize", () => {
	it("splits Chinese into bigrams", () => {
		const tokens = tokenize("劳动合同法");
		expect(tokens).toContain("劳动");
		expect(tokens).toContain("动合");
		expect(tokens).toContain("合同");
		expect(tokens).toContain("同法");
	});

	it("filters English stop words", () => {
		const tokens = tokenize("this is a contract");
		expect(tokens).not.toContain("is");
		expect(tokens).not.toContain("a");
		expect(tokens).toContain("this");
		expect(tokens).toContain("contract");
	});

	it("handles mixed Chinese and English", () => {
		const tokens = tokenize("中国 Contract Law 中国法律");
		expect(tokens.some((t) => t.includes("中国"))).toBe(true);
		expect(tokens).toContain("contract");
		expect(tokens).toContain("law");
	});
});

describe("BM25", () => {
	let bm25: BM25;

	beforeEach(() => {
		bm25 = new BM25();
	});

	it("indexes and searches basic docs", () => {
		bm25.index({
			id: "d1",
			title: "劳动合同法",
			content: "用人单位应当与劳动者签订书面劳动合同",
		});
		bm25.index({
			id: "d2",
			title: "民法典",
			content: "民事主体从事民事活动应当遵守法律",
		});
		bm25.index({ id: "d3", title: "刑法", content: "故意杀人罪刑事责任" });

		const hits = bm25.search("劳动合同");
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0]?.id).toBe("d1");
		expect(hits[0]?.source).toBe("bm25");
	});

	it("returns empty for query with only stop words", () => {
		bm25.index({ id: "d1", title: "合同", content: "合同内容" });
		const hits = bm25.search("的在了");
		expect(hits).toEqual([]);
	});

	it("generates snippet with <mark> highlights", () => {
		bm25.index({
			id: "d1",
			title: "违约金",
			content: "合同中约定违约金条款，违约金数额不得超过实际损失。",
		});
		const hits = bm25.search("违约金");
		expect(hits[0]?.snippet).toContain("<mark>");
	});

	it("removes docs", () => {
		bm25.index({ id: "d1", title: "合同法", content: "合同内容" });
		bm25.remove("d1");
		expect(bm25.size).toBe(0);
	});

	it("throws on missing id", () => {
		expect(() => bm25.index({ id: "", title: "t", content: "c" })).toThrow();
	});
});

describe("RRF fusion", () => {
	it("merges bm25 and semantic hits", () => {
		const bm25Hits: SearchHit[] = [
			{
				id: "a",
				title: "A",
				snippet: "s",
				score: 0.9,
				source: "bm25",
				rank: 1,
			},
			{
				id: "b",
				title: "B",
				snippet: "s",
				score: 0.7,
				source: "bm25",
				rank: 2,
			},
		];
		const semanticHits: SearchHit[] = [
			{
				id: "a",
				title: "A",
				snippet: "s",
				score: 0.95,
				source: "semantic",
				rank: 1,
			},
			{
				id: "c",
				title: "C",
				snippet: "s",
				score: 0.8,
				source: "semantic",
				rank: 2,
			},
		];
		const docMap = new Map<string, SearchDoc>([
			["a", { id: "a", title: "A", content: "content A" }],
			["b", { id: "b", title: "B", content: "content B" }],
			["c", { id: "c", title: "C", content: "content C" }],
		]);

		const fused = rrfFuse(bm25Hits, semanticHits, (id) => docMap.get(id));
		expect(fused.length).toBe(3);
		expect(fused[0]?.id).toBe("a"); // a 在两个列表都出现，RRF 最高
		expect(fused[0]?.source).toBe("hybrid");
	});
});

describe("HybridSearch", () => {
	it("searches with bm25 only when no semantic engine", async () => {
		const bm25 = new BM25();
		bm25.index({ id: "d1", title: "合同", content: "合同条款" });
		const hybrid = new HybridSearch(bm25);
		const result = await hybrid.search("合同");
		expect(result.hits.length).toBeGreaterThan(0);
		expect(result.semanticCount).toBe(0);
		expect(result.bm25Count).toBeGreaterThan(0);
	});

	it("combines bm25 and semantic when provided", async () => {
		const bm25 = new BM25();
		bm25.index({ id: "d1", title: "合同", content: "合同条款" });
		bm25.index({ id: "d2", title: "侵权", content: "侵权责任" });

		const semantic = new SemanticEngine(async (q, limit) =>
			[
				{ id: "d1", score: 0.9 },
				{ id: "d2", score: 0.85 },
			].slice(0, limit),
		);

		const hybrid = new HybridSearch(bm25, semantic);
		const result = await hybrid.search("合同");
		expect(result.bm25Count).toBeGreaterThan(0);
		expect(result.semanticCount).toBe(2);
	});

	it("falls back to bm25 when semantic fails", async () => {
		const bm25 = new BM25();
		bm25.index({ id: "d1", title: "合同", content: "合同条款" });

		const semantic = new SemanticEngine(async () => {
			throw new Error("embedding service down");
		});

		const hybrid = new HybridSearch(bm25, semantic);
		const result = await hybrid.search("合同");
		expect(result.hits.length).toBeGreaterThan(0);
		expect(result.semanticCount).toBe(0);
	});
});
