# Legal Analysis Skill

## Overview

The Legal Analysis skill enables AI agents to perform comprehensive legal document analysis, including summarization, risk identification, clause comparison, and legal question answering. This skill wraps the `analysis-worker` to provide structured legal insights with confidence scores and proper citations.

## System Context

This skill operates within the LegalAI MVP architecture:

```
┌─────────────────────────────────────────────────────────────┐
│  Agent → analysis-worker → LLM (Claude 3.5 Sonnet)        │
│           ↓                                               │
│     PostgreSQL + pgvector (knowledge retrieval)           │
└─────────────────────────────────────────────────────────────┘
```

**Supported jurisdictions:** CN (China) primary, with extensible support for multi-jurisdiction analysis.

---

## When to Use

Trigger this skill when the user requests:

- **Summarize** a contract, agreement, regulation, or legal document
- **Review risks** in a contract or identify potential legal issues
- **Compare clauses** between two documents or against standard terms
- **Answer legal questions** about a specific document or general legal topic
- **Extract key terms** from lengthy legal文本

### Invocation Triggers

| Trigger Phrases | Action |
|-----------------|--------|
| "summarize this contract" / "summarize this document" | `analysis::summarize` |
| "identify risks" / "review contract risks" / "风险审查" | `analysis::risk_review` |
| "compare clauses" / "compare with standard terms" / "条款对比" | `analysis::clause_compare` |
| "legal Q&A" / "answer my legal question" / "法律问答" | `analysis::qa` |
| "what does clause X mean" / "explain this term" | `analysis::qa` |

---

## Actions

### `analysis::summarize`

Generate a structured summary of any legal document.

#### When to Use

- User provides a contract or legal document and wants a quick overview
- Need to extract key parties, dates, obligations, and risks
- Preparing for contract negotiation or due diligence
- Onboarding to understand unfamiliar document types

#### Required Inputs

```typescript
{
  documentId: string;          // Unique document identifier
  documentText?: string;       // Full text if already loaded
  documentUrl?: string;        // Alternative: fetch from URL
  options?: {
    includeKeyObligations: boolean;  // Default: true
    includeRisks: boolean;           // Default: true
    maxLength: number;              // 100-5000, default: 1000
  };
}
```

#### Expected Output

```typescript
{
  id: string;
  timestamp: string;
  cached: boolean;
  confidence: number;  // 0-1, indicates reliability of summary
  
  result: {
    title: string;              // Document title/filename
    documentType: string;       // e.g., "Software License Agreement"
    keyParties: string[];      // Party names (licensor, licensee, etc.)
    effectiveDate?: string;     // ISO date string
    expirationDate?: string;    // ISO date string, if applicable
    mainPurpose: string;        // One-sentence summary
    keyObligations: string[];  // List of major obligations
    importantClauses: string[];// Highlighted special terms
    risks: string[];            // Identified risk factors
  }
}
```

#### Usage Example

```
User: "Summarize the attached software license agreement"

Agent Action:
  POST /api/analysis/summarize
  {
    "documentId": "doc-12345",
    "documentText": "<full text>",
    "options": {
      "includeKeyObligations": true,
      "includeRisks": true,
      "maxLength": 800
    }
  }

Response: Structured SummaryResult with confidence score
```

---

### `analysis::risk_review`

Identify and categorize legal risks within contracts or legal documents.

#### When to Use

- Pre-signature contract review
- Due diligence on business agreements
- Identifying problematic clauses in vendor contracts
- Compliance risk assessment

#### Risk Categories

| Category | Description | Common Risks |
|----------|-------------|--------------|
| `liability` | Risk allocation and limitation | Uncapped liability, broad indemnification |
| `termination` | Exit rights and termination clauses | Unilateral termination, long notice periods |
| `payment` | Financial obligations and penalties | Delayed payment terms, excessive penalties |
| `ip` | Intellectual property rights | Broad IP assignment, insufficient protection |
| `confidentiality` | NDA and information protection | Weak confidentiality terms, missing exclusions |
| `compliance` | Regulatory and legal compliance | Vague compliance obligations, undefined standards |

#### Required Inputs

```typescript
{
  documentId: string;          // Unique document identifier
  documentText: string;         // Full document text (required)
  riskCategories?: Array<      // Filter to specific categories
    'liability' | 'termination' | 'payment' | 
    'ip' | 'confidentiality' | 'compliance'
  >;
  jurisdiction?: string;        // Default: 'CN' (China)
}
```

#### Output Format

```typescript
{
  id: string;
  timestamp: string;
  cached: boolean;
  confidence: number;
  
  result: {
    overallRiskLevel: 'high' | 'medium' | 'low';
    risks: RiskItem[];
    summary: string;           // Executive summary
    recommendations: string[];  // Suggested modifications
  }
}

interface RiskItem {
  clause: string;              // The problematic clause text
  position: string;            // e.g., "Section 5.2", "Article 3"
  riskLevel: 'high' | 'medium' | 'low';
  description: string;         // Why this is risky
  suggestion: string;          // Recommended alternative
  legalCitations: Array<{
    code: string;              // e.g., "《民法典》"
    article?: string;          // e.g., "第584条"
    description: string;       // What the citation means
  }>;
}
```

#### Jurisdiction-Specific Rules

**China (CN - Default):**
- 《民法典》(Civil Code) - Contract general provisions
- 《公司法》(Company Law) - Corporate governance
- 《劳动合同法》(Labor Contract Law) - Employment matters
- 《网络安全法》《数据安全法》《个人信息保护法》- Data compliance

**Extensible:** Add `jurisdiction: 'US'` or `'HK'` for other regions (future support).

---

### `analysis::clause_compare`

Compare clauses between two documents or against standard clause libraries.

#### When to Use

- Vendor contract vs. standard terms comparison
- Redline review of negotiated changes
- Gap analysis between agreements
- Clause-level due diligence

#### Standard Clause Library

The system maintains a library of standard clauses:

| Clause Type | Standard Source | Description |
|-------------|-----------------|-------------|
| Confidentiality | NCCN Standard NDA | Balanced mutual NDA terms |
| Termination | ICC Standard | 30-day notice, cure periods |
| Liability Cap | industry-default | 12 months fees as cap |
| Force Majeure | ICC Standard | Standard FM definition |
| Governing Law | customizable | Based on jurisdiction |
| Dispute Resolution | customizable | Arbitration vs. litigation |

#### Required Inputs

```typescript
{
  documentIdA: string;          // First document
  documentTextA: string;        // Full text of first document
  documentIdB: string;          // Second document (or 'standard:{type}')
  documentTextB: string;        // Full text or standard clause reference
  clauseType?: string;         // Optional: focus on specific clause type
}
```

For comparing against standard terms, use `documentIdB: 'standard:confidentiality'` or similar.

#### Output Format

```typescript
{
  id: string;
  timestamp: string;
  cached: boolean;
  confidence: number;
  
  result: {
    documentA: { id: string; title: string };
    documentB: { id: string; title: string };
    differences: ClauseDiff[];
    overallAssessment: string;  // "Favorable" | "Unfavorable" | "Neutral"
    negotiationPriority: Array<{
      clause: string;
      priority: 'high' | 'medium' | 'low';
      rationale: string;
    }>;
  }
}

interface ClauseDiff {
  clauseA: string;              // Text from document A
  clauseB: string;              // Text from document B
  differenceType: 'added' | 'removed' | 'modified';
  significance: 'critical' | 'significant' | 'minor';
  analysis: string;             // Impact analysis
  suggestedStandardLanguage?: string;  // If deviating significantly
}
```

#### Comparison Methodology

1. **Semantic Matching:** Identify corresponding clauses via embedding similarity
2. **Structural Analysis:** Compare clause structure and completeness
3. **Risk Assessment:** Flag unfavorable deviations from standards
4. **Priority Scoring:** Rank negotiation priorities based on impact

---

### `analysis::qa`

Answer legal questions with citations drawn from the provided document.

#### When to Use

- Specific questions about contract terms
- Clarifying ambiguous clauses
- Understanding legal implications
- Researching specific legal questions

#### Question Types Supported

| Question Type | Example | Response Focus |
|---------------|---------|----------------|
| Definitional | "What is the definition of 'Confidential Information'?" | Clause extraction + explanation |
| Obligation | "What are the obligations of Party A?" | Obligation extraction + citation |
| Rights | "Can the licensor terminate early?" | Rights analysis + clause citation |
| Consequences | "What happens if Party B breaches?" | Consequence mapping + citation |
| Compliance | "What data protection obligations apply?" | Compliance clause identification |
| Comparison | "How does this compare to standard terms?" | Cross-reference analysis |

#### Required Inputs

```typescript
{
  documentId: string;           // Document to query against
  documentText: string;         // Full document text
  question: string;            // 5-500 characters
}
```

#### Output Format

```typescript
{
  id: string;
  timestamp: string;
  cached: boolean;
  confidence: number;
  
  result: {
    answer: string;            // Direct answer to the question
    confidence: number;         // Confidence in the answer
    supportingEvidence: Array<{
      clause: string;           // The relevant clause
      page?: number;            // Page number if available
      excerpt: string;          // Key excerpt
    }>;
    legalCitations: Array<{
      code: string;             // e.g., "《民法典》"
      article?: string;         // e.g., "第584条"
      description: string;      // Citation context
    }>;
  }
}
```

---

## Legal Accuracy Guidelines

### Source Citation Requirements

**ALWAYS provide citations when:**
- Making specific legal claims
- Interpreting statutory provisions
- Citing case law or regulations
- Advising on legal obligations

**Citation Format:**
```
{Code Name} 第{Article}条 - Brief description
Example: 《民法典》第584条 - 违约损失赔偿范围
```

### Confidence Thresholds

| Confidence | Interpretation | Agent Behavior |
|------------|-----------------|----------------|
| 0.9-1.0 | High confidence | Present as established fact |
| 0.7-0.9 | Medium confidence | Present with "typically" or "usually" |
| 0.5-0.7 | Low confidence | Flag uncertainty, suggest verification |
| < 0.5 | Uncertain | Decline to answer, recommend specialist |

### Uncertainty Flagging

When confidence is below 0.7, include:

```
⚠️ Uncertainty Note: [Explain the ambiguity or gap]
Recommendation: [Suggest how to resolve: e.g., "Consult jurisdiction-specific counsel"]
```

### Authority Classification

Always distinguish between:

| Authority Type | Description | Weight |
|----------------|-------------|--------|
| **Binding** | Statutory law, binding regulations | High |
| **Binding** | Published court decisions (stare decisis) | High |
| **Persuasive** | Court decisions from other jurisdictions | Medium |
| **Persuasive** | Academic commentary, law review articles | Low |
| **Not Authority** | General legal principles, international norms | Flag as such |

### Jurisdiction Handling

**China (CN):**
- Primary: 《民法典》for contract matters
- Secondary: Supreme Court interpretations
- Industry-specific: Regulatory guidelines

**Do NOT:**
- Apply US/EU law concepts without jurisdiction match
- Assume universal application of common law principles
- Cite regulations that conflict without noting the conflict

### Scope Limitations

**This skill does NOT replace:**
- Licensed legal advice from qualified attorneys
- Jurisdiction-specific counsel for complex matters
- Court filings or formal legal documents
- Situations requiring professional legal judgment

**This skill CAN provide:**
- Preliminary document review and risk identification
- Educational explanations of legal concepts
- Summary and comparison of document terms
- Flagging issues for professional review

---

## Error Handling

### Input Validation Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `documentText required` | Missing document content | Provide full text or valid documentId |
| `question too short` | Question < 5 characters | Expand the question |
| `question too long` | Question > 500 characters | Summarize the question |

### Processing Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `Document not found` | Invalid documentId | Verify documentId or upload document |
| `Analysis timeout` | Complex document | Retry with smaller maxLength |
| `Low confidence` | Ambiguous content | Review flagged sections manually |

### Graceful Degradation

If analysis worker is unavailable:
1. Attempt knowledge base retrieval as fallback
2. Present partial results with uncertainty flags
3. Recommend manual review for critical decisions

---

## Integration Examples

### Complete Contract Review Workflow

```
1. Summarize the contract
   → analysis::summarize
   
2. Identify risks across all categories
   → analysis::risk_review with riskCategories: all
   
3. Compare against standard terms
   → analysis::clause_compare with documentIdB: "standard:saas"
   
4. Answer specific questions
   → analysis::qa for any remaining clarifications
```

### Multi-Document Comparison

```
1. Upload Master Agreement (doc-A)
2. Upload Vendor Contract (doc-B)
3. Compare clauses
   → analysis::clause_compare(doc-A, doc-B, clauseType: "liability")
```

### Q&A Session Example

```
User: "What are the termination rights under this agreement?"
→ analysis::qa with question about termination

User: "Can Party A assign this contract without consent?"
→ analysis::qa with question about assignment

User: "What liability cap applies to data breaches?"
→ analysis::qa with question about liability + IP category
```

---

## Performance Expectations

| Operation | Target | Notes |
|-----------|--------|-------|
| Summarize (10-page doc) | < 3s | With caching |
| Risk review (standard contract) | < 10s | Full category scan |
| Clause comparison | < 5s | Two documents |
| Q&A response | < 2s | With citation extraction |

---

## Related Skills

- **legal-knowledge.md** - Knowledge base management and retrieval
- **legal-docgen.md** - Document generation from templates
