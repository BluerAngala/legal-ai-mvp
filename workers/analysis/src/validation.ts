/**
 * Quality Validation Module - Legal AI MVP
 * Ensures analysis accuracy and consistency
 */

import { z } from 'zod';

// ============================================================================
// Schema Definitions
// ============================================================================

export const RiskItemSchema = z.object({
  clause: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  description: z.string(),
  suggestion: z.string(),
  legal_basis: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const RiskReviewOutputSchema = z.object({
  risks: z.array(RiskItemSchema),
  overall_score: z.number().min(0).max(10),
  summary: z.string(),
  recommendations: z.array(z.string()),
  jurisdiction: z.string(),
  analyzed_at: z.string(),
  confidence: z.number().min(0).max(1),
});

export const ClauseAnalysisSchema = z.object({
  clause_id: z.string(),
  clause_text: z.string(),
  interpretation: z.string(),
  standard_compliant: z.boolean(),
  risk_assessment: z.enum(['high', 'medium', 'low']),
  suggestions: z.array(z.string()),
});

export const ClauseCompareOutputSchema = z.object({
  comparisons: z.array(
    z.object({
      aspect: z.string(),
      clause_a: z.string(),
      clause_b: z.string(),
      difference: z.string(),
      significance: z.enum(['critical', 'important', 'minor']),
      recommendation: z.string().optional(),
    })
  ),
  overall_similarity: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

export const QaOutputSchema = z.object({
  answer: z.string(),
  citations: z.array(
    z.object({
      text: z.string(),
      source: z.string(),
      location: z.string().optional(),
      page: z.number().optional(),
    })
  ),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

// ============================================================================
// Validation Functions
// ============================================================================

export type RiskItem = z.infer<typeof RiskItemSchema>;
export type RiskReviewOutput = z.infer<typeof RiskReviewOutputSchema>;
export type ClauseAnalysis = z.infer<typeof ClauseAnalysisSchema>;
export type ClauseCompareOutput = z.infer<typeof ClauseCompareOutputSchema>;
export type QaOutput = z.infer<typeof QaOutputSchema>;

/**
 * Validate analysis output against expected schema
 */
export function validateRiskReview(output: unknown): RiskReviewOutput {
  return RiskReviewOutputSchema.parse(output);
}

/**
 * Validate clause comparison output
 */
export function validateClauseCompare(output: unknown): ClauseCompareOutput {
  return ClauseCompareOutputSchema.parse(output);
}

/**
 * Validate Q&A output
 */
export function validateQa(output: unknown): QaOutput {
  return QaOutputSchema.parse(output);
}

// ============================================================================
// Consistency Checks
// ============================================================================

interface ConsistencyIssue {
  type: 'severity_mismatch' | 'missing_citation' | 'confidence_gap';
  severity: 'high' | 'medium' | 'low';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Check consistency of risk assessments
 */
export function checkRiskConsistency(
  risks: RiskItem[]
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  for (const risk of risks) {
    // Check confidence vs severity alignment
    if (risk.severity === 'high' && risk.confidence < 0.7) {
      issues.push({
        type: 'severity_mismatch',
        severity: 'medium',
        message: `High-severity risk "${risk.clause}" has low confidence (${risk.confidence}). Consider flagging for human review.`,
        details: { clause: risk.clause, confidence: risk.confidence },
      });
    }

    // Check for missing legal basis on high-severity risks
    if (risk.severity === 'high' && !risk.legal_basis) {
      issues.push({
        type: 'missing_citation',
        severity: 'low',
        message: `High-severity risk "${risk.clause}" lacks legal basis citation.`,
        details: { clause: risk.clause },
      });
    }
  }

  // Check for conflicting severity levels
  const highSeverityCount = risks.filter((r) => r.severity === 'high').length;
  if (highSeverityCount > 10) {
    issues.push({
      type: 'confidence_gap',
      severity: 'medium',
      message: `Unusually high number of high-severity risks (${highSeverityCount}). Review threshold calibration.`,
    });
  }

  return issues;
}

/**
 * Check citation quality
 */
export function checkCitationQuality(
  citations: QaOutput['citations']
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  for (const citation of citations) {
    if (!citation.source || citation.source.length < 3) {
      issues.push({
        type: 'missing_citation',
        severity: 'high',
        message: 'Citation missing or has invalid source.',
        details: { citation: citation.text.substring(0, 50) },
      });
    }
  }

  return issues;
}

// ============================================================================
// Quality Scoring
// ============================================================================

interface QualityScore {
  overall: number;
  dimensions: {
    completeness: number;
    accuracy: number;
    citations: number;
    consistency: number;
  };
  issues: ConsistencyIssue[];
}

/**
 * Calculate quality score for analysis output
 */
export function calculateQualityScore(
  output: RiskReviewOutput | ClauseCompareOutput | QaOutput,
  type: 'risk_review' | 'clause_compare' | 'qa'
): QualityScore {
  const issues: ConsistencyIssue[] = [];
  const dimensions = { completeness: 0, accuracy: 0, citations: 0, consistency: 0 };

  if (type === 'risk_review') {
    const riskOutput = output as RiskReviewOutput;

    // Completeness: check if all expected fields are populated
    dimensions.completeness = riskOutput.risks.length > 0 ? 1 : 0;
    if (riskOutput.summary && riskOutput.summary.length > 100) {
      dimensions.completeness = 1;
    }

    // Accuracy: based on confidence score
    dimensions.accuracy = riskOutput.confidence;

    // Consistency: check for issues
    issues.push(...checkRiskConsistency(riskOutput.risks));

    // Citations: check legal basis presence
    const withBasis = riskOutput.risks.filter((r) => r.legal_basis).length;
    dimensions.citations = riskOutput.risks.length > 0
      ? withBasis / riskOutput.risks.length
      : 1;
  } else if (type === 'qa') {
    const qaOutput = output as QaOutput;

    // Completeness
    dimensions.completeness = qaOutput.answer.length > 50 ? 1 : 0.5;

    // Accuracy
    dimensions.accuracy = qaOutput.confidence;

    // Citations
    dimensions.citations = qaOutput.citations.length > 0 ? 1 : 0;

    // Consistency
    issues.push(...checkCitationQuality(qaOutput.citations));
  } else {
    const compareOutput = output as ClauseCompareOutput;

    dimensions.completeness = compareOutput.comparisons.length > 0 ? 1 : 0;
    dimensions.accuracy = compareOutput.confidence;
    dimensions.citations = 1; // Clause comparison doesn't require citations
    dimensions.consistency = compareOutput.overall_similarity;
  }

  // Calculate consistency based on issues
  const criticalIssues = issues.filter((i) => i.severity === 'high').length;
  dimensions.consistency = Math.max(0, 1 - criticalIssues * 0.2);

  // Overall score: weighted average
  const weights = { completeness: 0.2, accuracy: 0.4, citations: 0.2, consistency: 0.2 };
  const overall = Object.entries(dimensions).reduce(
    (sum, [key, value]) => sum + value * weights[key as keyof typeof weights],
    0
  );

  return { overall, dimensions, issues };
}

/**
 * Determine if human review is needed
 */
export function needsHumanReview(quality: QualityScore): boolean {
  return (
    quality.overall < 0.7 ||
    quality.issues.some((i) => i.severity === 'high') ||
    quality.dimensions.accuracy < 0.6
  );
}
