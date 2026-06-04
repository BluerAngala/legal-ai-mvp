import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { registerWorker, http } from 'iii-sdk';

const ENGINE_URL = process.env.III_ENGINE_URL ?? 'ws://localhost:49134';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface AnalysisResult<T> {
  id: string;
  timestamp: string;
  cached: boolean;
  confidence: number;
  result: T;
}

interface RiskItem {
  clause: string;
  position: string;
  riskLevel: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
  legalCitations: Array<{
    code: string;
    article?: string;
    description: string;
  }>;
}

interface ClauseDiff {
  clauseA: string;
  clauseB: string;
  differenceType: 'added' | 'removed' | 'modified';
  significance: 'critical' | 'significant' | 'minor';
  analysis: string;
  suggestedStandardLanguage?: string;
}

interface QaAnswer {
  answer: string;
  confidence: number;
  supportingEvidence: Array<{
    clause: string;
    page?: number;
    excerpt: string;
  }>;
  legalCitations: Array<{
    code: string;
    article?: string;
    description: string;
  }>;
}

interface SummaryResult {
  title: string;
  documentType: string;
  keyParties: string[];
  effectiveDate?: string;
  expirationDate?: string;
  mainPurpose: string;
  keyObligations: string[];
  importantClauses: string[];
  risks: string[];
}

// ============================================================================
// Zod Schemas
// ============================================================================

const SummarizeInputSchema = z.object({
  documentId: z.string(),
  documentText: z.string().optional(),
  documentUrl: z.string().optional(),
  options: z.object({
    includeKeyObligations: z.boolean().default(true),
    includeRisks: z.boolean().default(true),
    maxLength: z.number().min(100).max(5000).default(1000),
  }).optional(),
});

const RiskReviewInputSchema = z.object({
  documentId: z.string(),
  documentText: z.string(),
  riskCategories: z.array(z.enum(['liability', 'termination', 'payment', 'ip', 'confidentiality', 'compliance'])).optional(),
  jurisdiction: z.string().default('CN'),
});

const ClauseCompareInputSchema = z.object({
  documentIdA: z.string(),
  documentTextA: z.string(),
  documentIdB: z.string(),
  documentTextB: z.string(),
  clauseType: z.string().optional(),
});

const QaInputSchema = z.object({
  documentId: z.string(),
  documentText: z.string(),
  question: z.string().min(5).max(500),
});

const SummarizeOutputSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  cached: z.boolean(),
  confidence: z.number().min(0).max(1),
  result: z.object({
    title: z.string(),
    documentType: z.string(),
    keyParties: z.array(z.string()),
    effectiveDate: z.string().optional(),
    expirationDate: z.string().optional(),
    mainPurpose: z.string(),
    keyObligations: z.array(z.string()),
    importantClauses: z.array(z.string()),
    risks: z.array(z.string()),
  }),
});

const RiskReviewOutputSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  cached: z.boolean(),
  confidence: z.number().min(0).max(1),
  result: z.object({
    overallRiskLevel: z.enum(['high', 'medium', 'low']),
    riskItems: z.array(z.object({
      clause: z.string(),
      position: z.string(),
      riskLevel: z.enum(['high', 'medium', 'low']),
      description: z.string(),
      suggestion: z.string(),
      legalCitations: z.array(z.object({
        code: z.string(),
        article: z.string().optional(),
        description: z.string(),
      })),
    })),
    summary: z.string(),
  }),
});

const ClauseCompareOutputSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  cached: z.boolean(),
  confidence: z.number().min(0).max(1),
  result: z.object({
    differences: z.array(z.object({
      clauseA: z.string(),
      clauseB: z.string(),
      differenceType: z.enum(['added', 'removed', 'modified']),
      significance: z.enum(['critical', 'significant', 'minor']),
      analysis: z.string(),
      suggestedStandardLanguage: z.string().optional(),
    })),
    similarity: z.number().min(0).max(1),
    recommendations: z.array(z.string()),
  }),
});

const QaOutputSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  cached: z.boolean(),
  confidence: z.number().min(0).max(1),
  result: z.object({
    answer: z.string(),
    confidence: z.number().min(0).max(1),
    supportingEvidence: z.array(z.object({
      clause: z.string(),
      page: z.number().optional(),
      excerpt: z.string(),
    })),
    legalCitations: z.array(z.object({
      code: z.string(),
      article: z.string().optional(),
      description: z.string(),
    })),
  }),
});

// ============================================================================
// Redis Cache
// ============================================================================

interface CacheEntry {
  value: string;
  expiry?: number;
}
interface RedisClient {
  cache: Map<string, CacheEntry>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<void>;
  del(key: string): Promise<void>;
}
let redisClient: RedisClient | null = null;
function getRedisClient(): RedisClient {
  if (!redisClient) {
    // In-memory cache for development; replace with Redis client in production
    const cache = new Map<string, CacheEntry>();
    redisClient = {
      cache,
      async get(key: string): Promise<string | null> {
        const item = cache.get(key);
        if (!item) return null;
        if (item.expiry && Date.now() > item.expiry) {
          cache.delete(key);
          return null;
        }
        return item.value;
      },
      async set(key: string, value: string, options?: { EX?: number }): Promise<void> {
        cache.set(key, {
          value,
          expiry: options?.EX ? Date.now() + options.EX * 1000 : undefined,
        });
      },
      async del(key: string): Promise<void> {
        cache.delete(key);
      },
    };
  }
  return redisClient;
}

function generateCacheKey(action: string, input: Record<string, unknown>): string {
  const hash = createHash('sha256')
    .update(JSON.stringify({ action, input }))
    .digest('hex')
    .substring(0, 16);
  return `analysis:${action}:${hash}`;
}

// ============================================================================
// Claude Client
// ============================================================================

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// ============================================================================
// System Prompt
// ============================================================================

const LEGAL_COUNSEL_SYSTEM_PROMPT = `You are a senior legal counsel with extensive experience in contract law, regulatory compliance, and risk management. Your expertise spans:

- Contract analysis and drafting
- Risk identification and mitigation
- Legal citation and precedent research
- Multi-jurisdiction legal knowledge (with focus on CN/CN jurisdictions)
- Standard contract language and best practices

When analyzing documents, you must:
1. Provide precise, actionable insights
2. Cite relevant legal codes and regulations
3. Maintain strict confidentiality
4. Consider both parties' interests and potential implications
5. Flag any ambiguous or potentially problematic language
6. Suggest standard/pro Forma language where applicable

Always provide confidence scores for your analysis and clearly distinguish between factual observations and professional opinions.`;

const ANALYSIS_PROMPTS = {
  summarize: `Analyze the provided legal document and generate a comprehensive summary including:

1. **Document Type**: Identify what type of document this is (contract, agreement, policy, etc.)
2. **Key Parties**: List all parties involved in the agreement
3. **Effective Date**: When the document takes effect (if applicable)
4. **Expiration Date**: When the document expires or terminates (if applicable)
5. **Main Purpose**: A clear description of what this document accomplishes
6. **Key Obligations**: Major responsibilities and commitments of each party
7. **Important Clauses**: List critical clauses that require attention
8. **Potential Risks**: Any provisions that may pose risks to either party

Provide the response in JSON format with confidence score.`,

  risk_review: `Review the provided legal document for potential risks and problematic clauses. For each identified risk:

1. **Clause**: Quote the specific clause or provision
2. **Position**: Where in the document this clause appears
3. **Risk Level**: HIGH (may cause significant harm), MEDIUM (concerning but manageable), or LOW (minor issue)
4. **Description**: Detailed explanation of why this is a risk
5. **Suggestion**: Specific language modifications to mitigate the risk
6. **Legal Citations**: Reference applicable laws, regulations, or precedents

Risk categories to consider:
- Liability and indemnification provisions
- Termination rights and notice periods
- Payment terms and penalties
- Intellectual property ownership and licensing
- Confidentiality and non-disclosure obligations
- Compliance requirements and regulatory considerations
- Force majeure and dispute resolution clauses

Provide the response in JSON format with an overall risk assessment and confidence score.`,

  clause_compare: `Compare clauses from two legal documents and identify:

1. **Differences**: For each clause that differs:
   - The text from Document A
   - The text from Document B
   - Difference Type: ADDED (new in B), REMOVED (in A only), MODIFIED (changed)
   - Significance: CRITICAL (major impact), SIGNIFICANT (notable difference), MINOR (cosmetic)
   - Analysis: Explanation of the practical implications
   
2. **Similarity Score**: Overall percentage of clause similarity

3. **Standard Language Recommendations**: For significant differences, suggest standard or best-practice language

Provide the response in JSON format with confidence score.`,

  qa: `Answer the user's question based strictly on the provided document content. For each answer:

1. **Answer**: Clear, direct response to the question
2. **Confidence**: Score 0-1 indicating how certain you are based on document evidence
3. **Supporting Evidence**: Quote relevant passages from the document
4. **Legal Citations**: Any applicable laws or regulations referenced

IMPORTANT: Only answer based on what's explicitly stated in the document. If the document doesn't contain information to answer the question, clearly state that. Never speculate or provide information not supported by the document.

Provide the response in JSON format.`,
};

// ============================================================================
// AI Processing Functions
// ============================================================================

async function callClaude(action: string, documentText: string, additionalContext?: Record<string, unknown>): Promise<{ content: string; confidence: number }> {
  const client = getAnthropicClient();
  const prompt = ANALYSIS_PROMPTS[action as keyof typeof ANALYSIS_PROMPTS];
  
  if (!prompt) {
    throw new Error(`Unknown analysis action: ${action}`);
  }

  let fullPrompt = prompt;
  if (additionalContext) {
    if (action === 'qa' && additionalContext.question) {
      fullPrompt = `${prompt}\n\nUSER'S QUESTION: ${additionalContext.question}`;
    }
    if (action === 'clause_compare' && additionalContext.clauseType) {
      fullPrompt = `${prompt}\n\nFocus on ${additionalContext.clauseType} clauses.`;
    }
    if (action === 'risk_review' && additionalContext.riskCategories) {
      fullPrompt = `${prompt}\n\nPrioritize these risk categories: ${(additionalContext.riskCategories as string[]).join(', ')}.`;
    }
  }

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: LEGAL_COUNSEL_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${fullPrompt}\n\nDOCUMENT:\n${documentText}`,
      },
    ],
  });

  const responseText = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // Estimate confidence based on response characteristics
  let confidence = 0.85;
  if (responseText.length < 100) confidence = 0.6;
  else if (responseText.length < 500) confidence = 0.75;
  if (responseText.includes('UNKNOWN') || responseText.includes('NOT FOUND')) {
    confidence = Math.min(confidence, 0.5);
  }

  return { content: responseText, confidence };
}

function parseJsonResponse<T>(content: string, schema: z.ZodSchema<T>): { data: T; confidence: number } {
  // Try to extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const validated = schema.parse(parsed);
  
  return { data: validated, confidence: 0.85 };
}

// ============================================================================
// Worker Actions
// ============================================================================

async function summarize(input: z.infer<typeof SummarizeInputSchema>): Promise<AnalysisResult<SummaryResult>> {
  const cacheKey = generateCacheKey('summarize', input);
  const redis = getRedisClient();
  
  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as AnalysisResult<SummaryResult>;
  }

  // Get document text
  let documentText = input.documentText || '';
  if (!documentText && input.documentUrl) {
    // Would fetch from URL in production
    throw new Error('Document URL fetching not implemented in this example');
  }

  // Process with Claude
  const { content, confidence } = await callClaude('summarize', documentText);
  
  // Parse and validate response
  const { data: result } = parseJsonResponse(content, SummarizeOutputSchema.shape.result);
  
  const analysisResult: AnalysisResult<SummaryResult> = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    cached: false,
    confidence,
    result,
  };

  // Cache for 1 hour
  await redis.set(cacheKey, JSON.stringify(analysisResult), { EX: 3600 });

  return analysisResult;
}

async function riskReview(input: z.infer<typeof RiskReviewInputSchema>): Promise<AnalysisResult<{
  overallRiskLevel: 'high' | 'medium' | 'low';
  riskItems: RiskItem[];
  summary: string;
}>> {
  const cacheKey = generateCacheKey('risk_review', input);
  const redis = getRedisClient();
  
  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    const result = JSON.parse(cached);
    result.cached = true;
    return result;
  }

  // Process with Claude
  const { content, confidence } = await callClaude('risk_review', input.documentText, {
    riskCategories: input.riskCategories,
  });
  
  // Parse and validate response
  const { data: result } = parseJsonResponse(content, RiskReviewOutputSchema.shape.result);
  
  // Determine overall risk level
  const riskCounts = { high: 0, medium: 0, low: 0 };
  result.riskItems.forEach((item) => {
    riskCounts[item.riskLevel]++;
  });
  
  let overallRiskLevel: 'high' | 'medium' | 'low' = 'low';
  if (riskCounts.high >= 2 || (riskCounts.high >= 1 && riskCounts.medium >= 2)) {
    overallRiskLevel = 'high';
  } else if (riskCounts.high >= 1 || riskCounts.medium >= 2) {
    overallRiskLevel = 'medium';
  }

  const analysisResult = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    cached: false,
    confidence,
    result: {
      ...result,
      overallRiskLevel,
    },
  };

  // Cache for 30 minutes (risks may change)
  await redis.set(cacheKey, JSON.stringify(analysisResult), { EX: 1800 });

  return analysisResult;
}

async function clauseCompare(input: z.infer<typeof ClauseCompareInputSchema>): Promise<AnalysisResult<{
  differences: ClauseDiff[];
  similarity: number;
  recommendations: string[];
}>> {
  const cacheKey = generateCacheKey('clause_compare', input);
  const redis = getRedisClient();
  
  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    const result = JSON.parse(cached);
    result.cached = true;
    return result;
  }

  // Process with Claude
  const combinedText = `DOCUMENT A:\n${input.documentTextA}\n\nDOCUMENT B:\n${input.documentTextB}`;
  const { content, confidence } = await callClaude('clause_compare', combinedText, {
    clauseType: input.clauseType,
  });
  
  // Parse and validate response
  const { data: result } = parseJsonResponse(content, ClauseCompareOutputSchema.shape.result);
  
  const analysisResult = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    cached: false,
    confidence,
    result,
  };

  // Cache for 1 hour
  await redis.set(cacheKey, JSON.stringify(analysisResult), { EX: 3600 });

  return analysisResult;
}

async function qa(input: z.infer<typeof QaInputSchema>): Promise<AnalysisResult<QaAnswer>> {
  const cacheKey = generateCacheKey('qa', { ...input, questionHash: createHash('sha256').update(input.question).digest('hex').substring(0, 8) });
  const redis = getRedisClient();
  
  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    const result = JSON.parse(cached);
    result.cached = true;
    return result;
  }

  // Process with Claude
  const { content, confidence } = await callClaude('qa', input.documentText, {
    question: input.question,
  });
  
  // Parse and validate response
  const { data: result } = parseJsonResponse(content, QaOutputSchema.shape.result);
  
  const analysisResult = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    cached: false,
    confidence,
    result: {
      ...result,
      confidence: Math.max(result.confidence, confidence),
    },
  };

  // Cache Q&A for 30 minutes
  await redis.set(cacheKey, JSON.stringify(analysisResult), { EX: 1800 });

  return analysisResult;
}

// ============================================================================
// Worker Registration
// ============================================================================

const sdk = registerWorker(ENGINE_URL, {
  workerName: 'analysis-worker',
});

// Register functions
sdk.registerFunction('analysis::summarize', async (input: unknown) => {
  const validated = SummarizeInputSchema.parse(input);
  return summarize(validated);
});

sdk.registerFunction('analysis::risk_review', async (input: unknown) => {
  const validated = RiskReviewInputSchema.parse(input);
  return riskReview(validated);
});

sdk.registerFunction('analysis::clause_compare', async (input: unknown) => {
  const validated = ClauseCompareInputSchema.parse(input);
  return clauseCompare(validated);
});

sdk.registerFunction('analysis::qa', async (input: unknown) => {
  const validated = QaInputSchema.parse(input);
  return qa(validated);
});

// HTTP trigger handlers
const handleSummarize = http(async (req) => {
  try {
    const body = req.body as Record<string, unknown>;
    const validated = SummarizeInputSchema.parse(body);
    const result = await summarize(validated);
    return { status_code: 200, body: result as unknown as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return { status_code: 500, body: { error: message } as Record<string, unknown> };
  }
});

const handleRiskReview = http(async (req) => {
  try {
    const body = req.body as Record<string, unknown>;
    const validated = RiskReviewInputSchema.parse(body);
    const result = await riskReview(validated);
    return { status_code: 200, body: result as unknown as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return { status_code: 500, body: { error: message } as Record<string, unknown> };
  }
});

const handleClauseCompare = http(async (req) => {
  try {
    const body = req.body as Record<string, unknown>;
    const validated = ClauseCompareInputSchema.parse(body);
    const result = await clauseCompare(validated);
    return { status_code: 200, body: result as unknown as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return { status_code: 500, body: { error: message } as Record<string, unknown> };
  }
});

const handleQa = http(async (req) => {
  try {
    const body = req.body as Record<string, unknown>;
    const validated = QaInputSchema.parse(body);
    const result = await qa(validated);
    return { status_code: 200, body: result as unknown as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return { status_code: 500, body: { error: message } as Record<string, unknown> };
  }
});

// Register HTTP triggers
sdk.registerTrigger({
  type: 'http',
  function_id: 'analysis::summarize',
  config: { api_path: '/api/analysis/summarize', http_method: 'POST' },
});

sdk.registerTrigger({
  type: 'http',
  function_id: 'analysis::risk_review',
  config: { api_path: '/api/analysis/risk_review', http_method: 'POST' },
});

sdk.registerTrigger({
  type: 'http',
  function_id: 'analysis::clause_compare',
  config: { api_path: '/api/analysis/clause_compare', http_method: 'POST' },
});

sdk.registerTrigger({
  type: 'http',
  function_id: 'analysis::qa',
  config: { api_path: '/api/analysis/qa', http_method: 'POST' },
});

console.log('Analysis worker registered');
console.log(`Engine URL: ${ENGINE_URL}`);