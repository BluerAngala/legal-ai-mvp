/**
 * Legal Prompts - Analysis Worker
 * Optimized prompts for legal analysis accuracy
 */

// ============================================================================
// System Prompt - Legal Counsel
// ============================================================================

export const LEGAL_COUNSEL_SYSTEM_PROMPT = `You are a senior legal counsel with 20+ years of experience in contract law, regulatory compliance, and risk management.

Your expertise includes:
- Contract drafting, review, and negotiation
- Corporate law and governance
- Intellectual property rights
- Data privacy and security (GDPR, PIPL, CCPA)
- Employment and labor law
- International trade and commerce
- Dispute resolution and litigation strategy

## Analysis Principles

1. **Precision over Speed**: Always prioritize accuracy over quick answers
2. **Cite Everything**: Reference specific clauses, articles, or sections
3. **Context Matters**: Consider jurisdiction, industry, and parties involved
4. **Risk Hierarchy**: Distinguish critical from minor concerns
5. **Practical Solutions**: Provide actionable recommendations

## Output Format

All analysis must include:
- Structured JSON output matching the provided schema
- Confidence scores (0-1) for each finding
- Legal citations with source identification
- Clear distinction between binding and persuasive authority
- Explicit flagging of uncertainty areas

## Jurisdiction

You are familiar with multiple jurisdictions. Default to PRC (China) law unless specified otherwise. For cross-border matters, identify applicable law and note conflicts.

## Ethical Boundaries

- Do not provide legal advice that could be construed as practicing law without a license
- Clearly distinguish legal analysis from business recommendations
- Flag matters requiring specialist referral (e.g., tax, criminal law)

Remember: Your analysis may be relied upon by legal professionals. Maintain the standards expected of senior counsel.`;

// ============================================================================
// Summarize Prompt
// ============================================================================

export const SUMMARIZE_PROMPT = `Analyze the following legal document and provide a comprehensive summary.

## Document
{{document}}

## Instructions
1. Identify the document type (contract, regulation, case, etc.)
2. Extract key parties and their roles
3. Summarize the main purpose and scope
4. Highlight critical terms and conditions
5. Note any unusual or non-standard provisions
6. Identify potential issues requiring attention

## Output Schema
{
  "document_type": string,
  "title": string,
  "parties": [{ "name": string, "role": string }],
  "summary": string (200-500 words),
  "key_provisions": [string],
  "critical_terms": [{ "term": string, "significance": string }],
  "potential_issues": [{ "issue": string, "severity": "high|medium|low" }],
  "recommended_review_areas": [string]
}

Provide confidence score (0-1) for this analysis.`;

// ============================================================================
// Risk Review Prompt
// ============================================================================

export const RISK_REVIEW_PROMPT = `Conduct a thorough risk review of the following contract.

## Contract
{{document}}

## Jurisdiction
{{jurisdiction}}

## Risk Categories to Consider
- **Liability**: Limitation of liability clauses, indemnification provisions
- **Termination**: Termination rights, notice periods, automatic termination
- **Payment**: Payment terms, late payment penalties, currency issues
- **IP Rights**: Ownership of deliverables, background IP, license grants
- **Confidentiality**: Scope, duration, permitted disclosures
- **Force Majeure**: Definition, coverage, notice requirements
- **Dispute Resolution**: Governing law, arbitration vs litigation, venue
- **Compliance**: Regulatory requirements, certifications, audits
- **Assignment**: Transfer restrictions, change of control provisions

## Instructions
1. Systematically review each clause
2. Identify risks with specific clause references
3. Assess severity (high/medium/low) with reasoning
4. Provide actionable recommendations
5. Cite relevant legal basis where applicable

## Output Schema
{
  "risks": [
    {
      "clause": "Exact clause text or description",
      "severity": "high|medium|low",
      "description": "Risk explanation",
      "suggestion": "Recommended modification",
      "legal_basis": "Relevant law or precedent (optional)",
      "confidence": number (0-1)
    }
  ],
  "overall_score": number (0-10, higher = more risky),
  "summary": string,
  "recommendations": [string],
  "jurisdiction": string,
  "analyzed_at": string (ISO 8601)
}

Provide confidence score (0-1) for this overall analysis.`;

// ============================================================================
// Clause Comparison Prompt
// ============================================================================

export const CLAUSE_COMPARE_PROMPT = `Compare the following clauses and identify key differences.

## Clause A
{{clause_a}}

## Clause B
{{clause_b}}

## Context
{{context}}

## Comparison Type
{{comparison_type}}

## Instructions
1. Identify corresponding clauses in both documents
2. Analyze each difference in detail
3. Assess significance of each difference
4. Provide recommendations for standardization where appropriate

## Output Schema
{
  "comparisons": [
    {
      "aspect": "Comparison aspect",
      "clause_a": "Relevant text from Clause A",
      "clause_b": "Relevant text from Clause B",
      "difference": "Description of difference",
      "significance": "critical|important|minor",
      "recommendation": "Suggested standard language (optional)"
    }
  ],
  "overall_similarity": number (0-1, higher = more similar),
  "recommendations": [string]
}

Provide confidence score (0-1) for this comparison.`;

// ============================================================================
// Q&A Prompt
// ============================================================================

export const QA_PROMPT = `Answer the following legal question based on the provided document.

## Question
{{question}}

## Document
{{document}}

## Instructions
1. Answer the question directly and precisely
2. Support your answer with specific references to the document
3. Note any limitations or conditions in the document
4. If the document doesn't contain sufficient information, state this clearly
5. Distinguish between explicit provisions and reasonable inferences

## Output Schema
{
  "answer": string,
  "citations": [
    {
      "text": "Exact quoted text",
      "source": "Document title or section reference",
      "location": "Page or paragraph reference (optional)"
    }
  ],
  "confidence": number (0-1),
  "reasoning": "Explanation of how you arrived at this answer"
}`;

// ============================================================================
// Prompt Helpers
// ============================================================================

/**
 * Render prompt with variables
 */
export function renderPrompt(
	template: string,
	variables: Record<string, string>,
): string {
	let result = template;
	for (const [key, value] of Object.entries(variables)) {
		result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
	}
	return result;
}

/**
 * Validate prompt variables
 */
export function validatePromptVariables(
	template: string,
	variables: Record<string, string>,
): { valid: boolean; missing: string[] } {
	const pattern = /\{\{(\w+)\}\}/g;
	const required = new Set<string>();
	let match;

	while ((match = pattern.exec(template)) !== null) {
		required.add(match[1]);
	}

	const missing = Array.from(required).filter((key) => !variables[key]);
	return { valid: missing.length === 0, missing };
}
