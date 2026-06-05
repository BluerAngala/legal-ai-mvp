/**
 * Analysis Worker — 合同摘要 / 风险审查 / 条款对比 / QA
 *
 * 重构要点：
 *   - 走 @legalai/llm（统一多 provider，不再硬编码 claude-sonnet-4-20250514）
 *   - 配置从 @legalai/config 读（不再 process.env.ANTHROPIC_API_KEY）
 *   - 缓存用内存 LRU（Redis 可选）
 *   - 风险关键词走 LLMClient.detectRiskKeywords（不再硬编码）
 */

import { init } from "iii-sdk";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadConfig } from "@legalai/config";
import { WorkerError, createLogger, unwrapApiRequest, wrapApiResponse } from "@legalai/core";
import { LLMClient, extractJson } from "@legalai/llm";

const cfg = loadConfig();
const log = createLogger("analysis-worker");

const llm = new LLMClient(cfg.llm);
const sdk = init(cfg.engine.url, {
	workerName: cfg.engine.workerName,
	invocationTimeoutMs: 400_000,
});

/* ---------- System Prompt ---------- */

const SYSTEM = `你是一名资深法律顾问，专长合同审查、风险识别与法律检索。
原则：
- 严格依据提供的文本回答，禁止编造
- 引用具体条款、章节、法律条文
- 区分事实陈述与法律意见
- 涉及不确定时明确标注
输出：严格的 JSON。`;

/* ---------- Cache ---------- */

interface CacheEntry {
	value: string;
	expiry: number;
}
const cache = new Map<string, CacheEntry>();
function cacheKey(action: string, input: unknown): string {
	return `analysis:${action}:${createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16)}`;
}
async function cacheGet(key: string): Promise<string | null> {
	const item = cache.get(key);
	if (!item) return null;
	if (Date.now() > item.expiry) {
		cache.delete(key);
		return null;
	}
	return item.value;
}
async function cacheSet(
	key: string,
	value: string,
	ttlSec: number,
): Promise<void> {
	cache.set(key, { value, expiry: Date.now() + ttlSec * 1000 });
}

/* ---------- Schemas ---------- */

const SummarizeInput = z.object({
	documentText: z.string().min(1),
	options: z
		.object({
			maxLength: z.number().int().min(100).max(5000).default(1000),
		})
		.optional(),
});

const RiskReviewInput = z.object({
	documentText: z.string().min(1),
	riskKeywords: z
		.array(
			z.object({
				keyword: z.string(),
				level: z.enum(["high", "medium", "low"]),
				desc: z.string().optional(),
			}),
		)
		.optional(),
	jurisdiction: z.string().default("CN"),
});

const QaInput = z.object({
	documentText: z.string().min(1),
	question: z.string().min(5).max(500),
});

const ClauseCompareInput = z.object({
	documentTextA: z.string().min(1),
	documentTextB: z.string().min(1),
	clauseType: z.string().optional(),
});

/* ---------- Functions ---------- */

async function summarize(input: unknown) {
	const data = unwrapApiRequest(input);
	const { documentText, options } = SummarizeInput.parse(data);
	const key = cacheKey("summarize", {
		documentText: documentText.slice(0, 4000),
		options,
	});
	const hit = await cacheGet(key);
	if (hit) return { ...JSON.parse(hit), cached: true };

	const prompt = `请对以下法律文档生成结构化摘要。返回 JSON：
{
  "title": "文档标题",
  "documentType": "合同/协议/政策/法律意见书/其他",
  "keyParties": ["甲方", "乙方"],
  "effectiveDate": "生效日期或 null",
  "expirationDate": "到期日期或 null",
  "mainPurpose": "100-200字核心目的",
  "keyObligations": ["义务1", "义务2"],
  "importantClauses": ["关键条款1"],
  "risks": ["风险点1"]
}

文档（截断）：
${documentText.slice(0, options?.maxLength ?? 1000 * 4)}`;

	const text = await llm.chat([{ role: "user", content: prompt }], {
		system: SYSTEM,
		temperature: 0.2,
	});
	const extractedData = extractJson<{
		title: string;
		documentType: string;
		keyParties: string[];
		effectiveDate: string | null;
		expirationDate: string | null;
		mainPurpose: string;
		keyObligations: string[];
		importantClauses: string[];
		risks: string[];
	}>(text);
	const result = {
		id: randomUUID(),
		timestamp: new Date().toISOString(),
		confidence: 0.85,
		result: extractedData,
	};
	await cacheSet(key, JSON.stringify(result), 3600);
	return result;
}

async function riskReview(input: unknown) {
	const data = unwrapApiRequest(input);
	const args = RiskReviewInput.parse(data);
	const key = cacheKey("risk_review", {
		hash: createHash("sha256").update(args.documentText).digest("hex"),
	});
	const hit = await cacheGet(key);
	if (hit) return { ...JSON.parse(hit), cached: true };

	// 1) 关键词命中（@legalai/llm）
	const keywordRisks = args.riskKeywords
		? llm.detectRiskKeywords(args.documentText, args.riskKeywords)
		: [];

	// 2) LLM 整体风险评估
	const prompt = `请对以下${args.jurisdiction}法律文档做风险审查。返回 JSON：
{
  "overallRiskLevel": "high|medium|low",
  "riskItems": [{
    "clause": "原条款摘录",
    "riskLevel": "high|medium|low",
    "description": "风险说明",
    "suggestion": "修改建议",
    "legalCitations": [{"code": "法典", "article": "条款号", "description": "说明"}]
  }],
  "summary": "总评"
}

文档：
${args.documentText.slice(0, 6000)}`;

	const text = await llm.chat([{ role: "user", content: prompt }], {
		system: SYSTEM,
		temperature: 0.2,
	});
	const llmResult = extractJson<{
		overallRiskLevel: "high" | "medium" | "low";
		riskItems: Array<{
			clause: string;
			riskLevel: "high" | "medium" | "low";
			description: string;
			suggestion: string;
			legalCitations: Array<{
				code: string;
				article?: string;
				description: string;
			}>;
		}>;
		summary: string;
	}>(text);

	// 3) 合并（去重 by clause）
	const merged = mergeRisks(keywordRisks, llmResult.riskItems);
	const result = {
		id: randomUUID(),
		timestamp: new Date().toISOString(),
		confidence: 0.85,
		result: { ...llmResult, riskItems: merged },
	};
	await cacheSet(key, JSON.stringify(result), 1800);
	return result;
}

async function qa(input: unknown) {
	const data = unwrapApiRequest(input);
	const { documentText, question } = QaInput.parse(data);
	const key = cacheKey("qa", {
		q: question,
		h: createHash("sha256").update(documentText).digest("hex").slice(0, 8),
	});
	const hit = await cacheGet(key);
	if (hit) return { ...JSON.parse(hit), cached: true };

	const prompt = `请严格基于以下文档回答用户问题。若文档未含答案，明确说"文档未提供此信息"。

返回 JSON：
{
  "answer": "回答",
  "confidence": 0.0-1.0,
  "supportingEvidence": [{"excerpt": "原文摘录", "clause": "条款名"}],
  "legalCitations": [{"code": "法典", "article": "条款号", "description": "说明"}]
}

文档：
${documentText.slice(0, 6000)}

问题：${question}`;

	const text = await llm.chat([{ role: "user", content: prompt }], {
		system: SYSTEM,
		temperature: 0.2,
	});
	const extractedData = extractJson<{
		answer: string;
		confidence: number;
		supportingEvidence: Array<{ excerpt: string; clause?: string }>;
		legalCitations: Array<{
			code: string;
			article?: string;
			description: string;
		}>;
	}>(text);
	const result = {
		id: randomUUID(),
		timestamp: new Date().toISOString(),
		confidence: extractedData.confidence,
		result: extractedData,
	};
	await cacheSet(key, JSON.stringify(result), 3600);
	return result;
}

async function clauseCompare(input: unknown) {
	const data = unwrapApiRequest(input);
	const args = ClauseCompareInput.parse(data);
	const prompt = `比较以下两份文档的${args.clauseType ?? "所有"}条款差异。返回 JSON：
{
  "differences": [{
    "clauseA": "A 条款",
    "clauseB": "B 条款",
    "differenceType": "added|removed|modified",
    "significance": "critical|significant|minor",
    "analysis": "差异影响分析",
    "suggestedStandardLanguage": "推荐标准措辞"
  }],
  "similarity": 0.0-1.0,
  "recommendations": ["建议1"]
}

文档 A：
${args.documentTextA.slice(0, 4000)}

文档 B：
${args.documentTextB.slice(0, 4000)}`;

	const text = await llm.chat([{ role: "user", content: prompt }], {
		system: SYSTEM,
		temperature: 0.2,
	});
	return {
		id: randomUUID(),
		timestamp: new Date().toISOString(),
		confidence: 0.8,
		result: extractJson(text),
	};
}

function mergeRisks(
	kw: Array<{
		clause: string;
		risk_level: "high" | "medium" | "low";
		description: string;
		suggestion: string;
		offset: number;
	}>,
	llmItems: Array<{
		clause: string;
		riskLevel: "high" | "medium" | "low";
		description: string;
		suggestion: string;
		legalCitations: Array<{
			code: string;
			article?: string;
			description: string;
		}>;
	}>,
): Array<{
	clause: string;
	riskLevel: "high" | "medium" | "low";
	description: string;
	suggestion: string;
	legalCitations: Array<{
		code: string;
		article?: string;
		description: string;
	}>;
}> {
	const seen = new Set<string>();
	const out: Array<{
		clause: string;
		riskLevel: "high" | "medium" | "low";
		description: string;
		suggestion: string;
		legalCitations: Array<{
			code: string;
			article?: string;
			description: string;
		}>;
	}> = [];
	// LLM 结果优先
	for (const it of llmItems) {
		const key = it.clause.slice(0, 30);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ ...it });
	}
	// 关键词补充
	for (const k of kw) {
		const key = k.clause.slice(0, 30);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			clause: k.clause,
			riskLevel: k.risk_level,
			description: k.description,
			suggestion: k.suggestion,
			legalCitations: [],
		});
	}
	return out;
}

/* ---------- Registration ---------- */

sdk.registerFunction({ id: "analysis::summarize", description: "Generate a structured summary of a legal document." }, wrapApiResponse(summarize));
sdk.registerFunction({ id: "analysis::risk_review", description: "Review a legal document for risks using LLM and risk keywords." }, wrapApiResponse(riskReview));
sdk.registerFunction({ id: "analysis::qa", description: "Answer a question strictly based on the provided legal document." }, wrapApiResponse(qa));
sdk.registerFunction({ id: "analysis::clause_compare", description: "Compare clauses between two legal documents." }, wrapApiResponse(clauseCompare));

sdk.registerTrigger({
	type: "http",
	function_id: "analysis::summarize",
	config: { api_path: "/api/analysis/summarize", http_method: "POST" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "analysis::risk_review",
	config: { api_path: "/api/analysis/risk-review", http_method: "POST" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "analysis::qa",
	config: { api_path: "/api/analysis/qa", http_method: "POST" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "analysis::clause_compare",
	config: { api_path: "/api/analysis/clause-compare", http_method: "POST" },
});

log.info("Analysis worker registered", {
	engine: cfg.engine.url,
	llm: cfg.llm.provider,
});

export { summarize, riskReview, qa, clauseCompare };
