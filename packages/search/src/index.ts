/**
 * @legalai/search - BM25 + 语义搜索 + RRF 融合
 *
 * 设计：
 *   - 停用词从外部注入（默认内置一套中英基础集，但不写死）
 *   - BM25 内存索引（O(N) 倒排）
 *   - SemanticEngine 接受外部相似度函数（由 packages/llm 提供 embedding）
 *   - HybridSearch 用 RRF（Reciprocal Rank Fusion）合并两个排序
 */

import { SearchError } from "@legalai/core";

export interface SearchDoc {
	id: string;
	title: string;
	content: string;
	meta?: Record<string, unknown>;
}

export interface SearchHit {
	id: string;
	title: string;
	snippet: string;
	score: number;
	meta?: Record<string, unknown>;
	/** 来源渠道 */
	source: "bm25" | "semantic" | "hybrid";
	/** 在 RRF 中的排名（1-based） */
	rank?: number;
}

export interface BM25Options {
	k1?: number;
	b?: number;
	stopWords?: Set<string>;
}

const DEFAULT_STOP_WORDS = new Set([
	"的",
	"了",
	"和",
	"是",
	"在",
	"与",
	"及",
	"或",
	"为",
	"于",
	"其",
	"之",
	"the",
	"a",
	"an",
	"and",
	"or",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
]);

/* ---------- Tokenizer ---------- */

export function tokenize(
	text: string,
	stopWords: Set<string> = DEFAULT_STOP_WORDS,
): string[] {
	// 中文：二元切分（bigram），覆盖大多数法律术语
	const chineseSegments = text.match(/[\u4e00-\u9fa5]+/g) ?? [];
	const chineseWords: string[] = [];
	for (const seg of chineseSegments) {
		if (seg.length === 1) {
			chineseWords.push(seg);
		} else {
			for (let i = 0; i < seg.length - 1; i++) {
				chineseWords.push(seg.slice(i, i + 2));
			}
		}
	}

	// 英文/数字：单词级
	const english = text
		.toLowerCase()
		.replace(/[^\w\s]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 1);

	return [...chineseWords, ...english].filter((w) => !stopWords.has(w));
}

/* ---------- BM25 ---------- */

export class BM25 {
	private docs = new Map<
		string,
		{ title: string; content: string; meta?: Record<string, unknown> }
	>();
	private invertedIndex = new Map<string, Map<string, number>>();
	private docLengths = new Map<string, number>();
	private avgDocLength = 0;
	private readonly k1: number;
	private readonly b: number;
	private readonly stopWords: Set<string>;

	constructor(opts: BM25Options = {}) {
		this.k1 = opts.k1 ?? 1.5;
		this.b = opts.b ?? 0.75;
		this.stopWords = opts.stopWords ?? DEFAULT_STOP_WORDS;
	}

	index(doc: SearchDoc): void {
		if (!doc.id) throw new SearchError("BM25.index: doc.id is required");
		this.docs.set(doc.id, {
			title: doc.title,
			content: doc.content,
			meta: doc.meta,
		});

		const tokens = tokenize(`${doc.title} ${doc.content}`, this.stopWords);
		this.docLengths.set(doc.id, tokens.length);

		for (const tok of tokens) {
			let df = this.invertedIndex.get(tok);
			if (!df) {
				df = new Map();
				this.invertedIndex.set(tok, df);
			}
			df.set(doc.id, (df.get(doc.id) ?? 0) + 1);
		}

		this.recomputeAvgDocLength();
	}

	remove(id: string): void {
		this.docs.delete(id);
		this.docLengths.delete(id);
		for (const [, df] of this.invertedIndex) df.delete(id);
		this.recomputeAvgDocLength();
	}

	search(query: string, limit = 10): SearchHit[] {
		const queryTokens = tokenize(query, this.stopWords);
		if (queryTokens.length === 0) return [];
		const scores = new Map<string, number>();
		const N = this.docs.size;

		for (const tok of queryTokens) {
			const df = this.invertedIndex.get(tok);
			if (!df) continue;
			const idf = Math.log((N - df.size + 0.5) / (df.size + 0.5) + 1);
			for (const [docId, tf] of df) {
				const docLen = this.docLengths.get(docId) ?? 1;
				const norm =
					tf +
					this.k1 *
						(1 - this.b + (this.b * docLen) / Math.max(this.avgDocLength, 1));
				const score = idf * ((tf * (this.k1 + 1)) / norm);
				scores.set(docId, (scores.get(docId) ?? 0) + score);
			}
		}

		return Array.from(scores.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, limit)
			.map(([id, score], idx) => {
				const doc = this.docs.get(id);
				if (!doc)
					throw new SearchError(`Inconsistent index: doc ${id} not found`);
				return {
					id,
					title: doc.title,
					snippet: this.generateSnippet(doc.content, queryTokens),
					score,
					source: "bm25" as const,
					rank: idx + 1,
					meta: doc.meta,
				};
			});
	}

	private generateSnippet(content: string, queryTokens: string[]): string {
		const sentences = content.split(/[.!?。！？\n]+/).filter((s) => s.trim());
		let bestSentence = sentences[0] ?? content.slice(0, 100);
		let maxMatches = 0;
		for (const sent of sentences) {
			const m = queryTokens.filter((t) => sent.includes(t)).length;
			if (m > maxMatches) {
				maxMatches = m;
				bestSentence = sent;
			}
		}
		let snippet = bestSentence.slice(0, 200);
		if (bestSentence.length > 200) snippet += "...";
		for (const tok of queryTokens) {
			if (tok.length >= 2) {
				snippet = snippet.replace(
					new RegExp(`(${escapeRegExp(tok)})`, "gi"),
					"<mark>$1</mark>",
				);
			}
		}
		return snippet;
	}

	private recomputeAvgDocLength(): void {
		if (this.docLengths.size === 0) {
			this.avgDocLength = 0;
			return;
		}
		let total = 0;
		for (const l of this.docLengths.values()) total += l;
		this.avgDocLength = total / this.docLengths.size;
	}

	get size(): number {
		return this.docs.size;
	}
}

/* ---------- Semantic Engine ---------- */

export interface SemanticHit {
	id: string;
	score: number;
}

/**
 * 语义搜索的"查询器"：给定 query 文本，返回 [(id, score)] 列表。
 * 由 packages/llm 提供（embed query → 算 cosine similarity → 排序）。
 */
export type SemanticQueryFn = (
	query: string,
	limit: number,
) => Promise<SemanticHit[]>;

export class SemanticEngine {
	constructor(private readonly queryFn: SemanticQueryFn) {}

	async search(query: string, limit = 10): Promise<SearchHit[]> {
		const hits = await this.queryFn(query, limit);
		return hits.map((h, idx) => ({
			id: h.id,
			title: "", // 由调用方通过 RRF 合并时补全
			snippet: "",
			score: h.score,
			source: "semantic" as const,
			rank: idx + 1,
		}));
	}
}

/* ---------- RRF (Reciprocal Rank Fusion) ---------- */

export interface RRFOption {
	k?: number; // RRF 常数（一般 60）
}

export function rrfFuse(
	bm25Hits: SearchHit[],
	semanticHits: SearchHit[],
	docLookup: (id: string) => SearchDoc | undefined,
	opts: RRFOption = {},
): SearchHit[] {
	const k = opts.k ?? 60;
	const fused = new Map<string, { hit: SearchHit; rrf: number }>();

	for (const hit of bm25Hits) {
		fused.set(hit.id, {
			hit: { ...hit, source: "hybrid" },
			rrf: 1 / (k + (hit.rank ?? 0)),
		});
	}

	for (const hit of semanticHits) {
		const existing = fused.get(hit.id);
		if (existing) {
			existing.rrf += 1 / (k + (hit.rank ?? 0));
			// 用 BM25 的 title/snippet（语义搜索可能没 title）
			existing.hit = { ...existing.hit, score: existing.rrf };
		} else {
			const doc = docLookup(hit.id);
			fused.set(hit.id, {
				hit: {
					id: hit.id,
					title: doc?.title ?? "",
					snippet: doc ? doc.content.slice(0, 200) : "",
					score: 1 / (k + (hit.rank ?? 0)),
					source: "hybrid",
					rank: hit.rank,
					meta: doc?.meta,
				},
				rrf: 1 / (k + (hit.rank ?? 0)),
			});
		}
	}

	return Array.from(fused.values())
		.map(({ hit, rrf }) => ({ ...hit, score: rrf }))
		.sort((a, b) => b.score - a.score);
}

/* ---------- Hybrid Search (组合 BM25 + Semantic + RRF) ---------- */

export interface HybridResult {
	hits: SearchHit[];
	bm25Count: number;
	semanticCount: number;
}

export class HybridSearch {
	constructor(
		private readonly bm25: BM25,
		private readonly semantic?: SemanticEngine,
		private readonly rrfOpts: RRFOption = {},
	) {}

	async search(query: string, limit = 10): Promise<HybridResult> {
		const bm25Hits = this.bm25.search(query, limit);
		let semanticHits: SearchHit[] = [];
		if (this.semantic) {
			try {
				semanticHits = await this.semantic.search(query, limit);
			} catch (err) {
				// 语义搜索失败不阻塞 BM25
				semanticHits = [];
			}
		}

		const fused = rrfFuse(
			bm25Hits,
			semanticHits,
			(id) => this.bm25["docs"].get(id) as SearchDoc | undefined,
			this.rrfOpts,
		);
		return {
			hits: fused.slice(0, limit),
			bm25Count: bm25Hits.length,
			semanticCount: semanticHits.length,
		};
	}
}

/* ---------- 辅助 ---------- */

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ---------- 单例 ---------- */

let _bm25: BM25 | null = null;
export function getBM25(opts?: BM25Options): BM25 {
	if (!_bm25) _bm25 = new BM25(opts);
	return _bm25;
}
export function resetBM25(): void {
	_bm25 = null;
}
