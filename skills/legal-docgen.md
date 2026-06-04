# Legal Document Generation Skill

## Overview

The `legal-docgen` skill enables AI agents to generate legal documents from templates. It handles template listing, variable substitution, document generation, and multi-format export (Markdown, HTML, DOCX).

Documents are generated server-side via the `/api/docgen/*` endpoints. The system uses **Mustache-style placeholders** (`{{variableName}}`) for variable substitution.

---

## When to Use

Use this skill when the user wants to:
- Create a contract, letter, report, or legal brief from a template
- List available legal document templates
- Fill in template variables and generate a formatted document
- Export a generated document to a specific format (Markdown, HTML, DOCX)

**Do not use this skill** for:
- Analyzing existing documents (use `legal-analysis` skill instead)
- Searching the knowledge base (use `legal-knowledge` skill instead)
- Uploading or processing uploaded documents (use `legal-document` skill instead)

---

## API Endpoints

Base URL: `/api/docgen`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/templates` | GET | List available templates |
| `/templates/:id` | GET | Get a specific template |
| `/generate` | POST | Generate a document from a template |
| `/documents/:id` | GET | Get a generated document |
| `/documents/:id/export` | POST | Export a document to a specific format |

---

## Available Templates

### Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `contract` | Legal agreements between parties | NDA, employment contract, service agreement |
| `letter` | Formal correspondence | Demand letter, cease and desist, legal opinion |
| `report` | Legal analysis documents | Case summary, due diligence report |
| `brief` | Court filings and submissions | Legal memorandum, motion brief |

### List Templates

**Request:**
```http
GET /api/docgen/templates?category=contract&limit=20&offset=0
```

**Query Parameters:**
- `category` (optional): Filter by `contract`, `letter`, `report`, or `brief`
- `search` (optional): Search template names and descriptions
- `limit` (optional): Number of results (default: 20, max: 100)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "templates": [
    {
      "id": "uuid-string",
      "name": "Non-Disclosure Agreement",
      "category": "contract",
      "description": "Standard mutual NDA for business discussions",
      "variables": [
        { "name": "party_a_name", "type": "text", "label": "Party A Name", "required": true },
        { "name": "party_b_name", "type": "text", "label": "Party B Name", "required": true },
        { "name": "effective_date", "type": "date", "label": "Effective Date", "required": true },
        { "name": "confidentiality_period", "type": "select", "label": "Confidentiality Period", "required": true,
          "options": [
            { "value": "2_years", "label": "2 Years" },
            { "value": "5_years", "label": "5 Years" },
            { "value": "indefinite", "label": "Indefinite" }
          ]
        }
      ],
      "isPublic": true,
      "createdBy": "system"
    }
  ],
  "total": 15,
  "limit": 20,
  "offset": 0
}
```

---

## Template Variables

### Variable Types

| Type | Description | Validation |
|------|-------------|------------|
| `text` | Plain text input | Must be a non-empty string |
| `date` | Date value | ISO 8601 format (`YYYY-MM-DD`) or Date object |
| `number` | Numeric value | Integer or decimal number |
| `select` | Dropdown selection | Must match one of the defined options |
| `document_ref` | Reference to another document | Must be a valid document ID string |

### Variable Schema

Each variable has these properties:

```typescript
interface TemplateVariable {
  name: string;           // Variable name (used in placeholder: {{name}})
  type: 'text' | 'date' | 'number' | 'select' | 'document_ref';
  label: string;          // Human-readable label for forms
  required: boolean;      // Whether this variable is mandatory
  defaultValue?: string | number;  // Optional default value
  options?: { value: string; label: string }[];  // For select type only
  description?: string;   // Help text for the variable
}
```

### Required vs Optional Variables

- **Required variables**: Must be provided or validation fails with error: `Required variable "{{name}}" is missing`
- **Optional variables**: If omitted, the placeholder renders as empty string
- Variables with `defaultValue` can be omitted and the default will be used

### Common Template Variables

Typical variables found across templates:

| Variable | Type | Description |
|----------|------|-------------|
| `party_a_name` | text | First party's full legal name |
| `party_b_name` | text | Second party's full legal name |
| `effective_date` | date | Contract effective date |
| `jurisdiction` | select | Governing law jurisdiction |
| `purpose` | text | Purpose or scope of agreement |
| `term_years` | number | Contract duration in years |
| `notice_days` | number | Days for required notices |
| `governing_law` | text | Applicable state/country law |

---

## Document Generation

### Generate a Document

**Request:**
```http
POST /api/docgen/generate
Content-Type: application/json

{
  "templateId": "uuid-of-template",
  "variables": {
    "party_a_name": "Acme Corporation",
    "party_b_name": "Beta Industries LLC",
    "effective_date": "2024-01-15",
    "confidentiality_period": "2_years"
  },
  "ownerId": "user-uuid"  // optional
}
```

**Response:**
```json
{
  "id": "generated-doc-uuid",
  "templateId": "uuid-of-template",
  "templateName": "Non-Disclosure Agreement",
  "content": "# NON-DISCLOSURE AGREEMENT\n\nThis Non-Disclosure Agreement...",
  "format": "markdown",
  "variables": {
    "party_a_name": "Acme Corporation",
    "party_b_name": "Beta Industries LLC"
  },
  "metadata": {
    "generatedAt": "2024-01-15T10:30:00Z",
    "generatedBy": "agent",
    "wordCount": 1250
  }
}
```

### Variable Validation

Before generating, the system validates:

1. **Required fields**: All required variables are present and non-empty
2. **Type checking**: Values match their declared types
3. **Select options**: Select values are from the allowed options list
4. **Date format**: Date values parse correctly

**Validation Error Example:**
```json
{
  "valid": false,
  "errors": [
    "Required variable \"effective_date\" is missing",
    "Variable \"confidentiality_period\" must be one of: 2_years, 5_years, indefinite"
  ]
}
```

---

## Export Options

### Supported Formats

| Format | Extension | Use Case |
|--------|-----------|----------|
| `markdown` | `.md` | Editing, version control, further processing |
| `html` | `.html` | Web viewing, email attachments |
| `docx` | `.docx` | Word processing, printing, signatures |

### Export a Document

**Request:**
```http
POST /api/docgen/documents/:id/export
Content-Type: application/json

{
  "format": "docx"
}
```

**Response:**
```json
{
  "content": "base64-encoded-content",
  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "extension": "docx"
}
```

### Format Details

#### Markdown Export
- Returns content as-is (already Markdown format)
- Best for: further editing, version control, web CMS
- `mimeType`: `text/markdown`

#### HTML Export
- Wraps Markdown content in a styled HTML document
- Includes CSS styling for headers, lists, tables
- Best for: web viewing, email with rich formatting
- `mimeType`: `text/html`

#### DOCX Export
- Converts Markdown to Word document format
- Preserves: headings (H1-H6), bold, italic, lists, tables
- Best for: legal review, printing, electronic signatures
- `mimeType`: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

---

## Examples

### Example 1: Generate an NDA

**Step 1: List contract templates**
```json
GET /api/docgen/templates?category=contract
```

**Step 2: Find the NDA template and inspect variables**
```json
GET /api/docgen/templates/nda-template-uuid
```

**Step 3: Generate the document**
```json
POST /api/docgen/generate
{
  "templateId": "nda-template-uuid",
  "variables": {
    "party_a_name": "Smith & Associates LLP",
    "party_b_name": "TechStart Inc.",
    "effective_date": "2024-06-01",
    "confidentiality_period": "2_years",
    "governing_law": "State of Delaware"
  }
}
```

**Step 4: Export to DOCX for signing**
```json
POST /api/docgen/documents/generated-uuid/export
{
  "format": "docx"
}
```

---

### Example 2: Generate a Demand Letter

**Step 1: List letter templates**
```json
GET /api/docgen/templates?category=letter&search=demand
```

**Step 2: Generate with all required variables**
```json
POST /api/docgen/generate
{
  "templateId": "demand-letter-uuid",
  "variables": {
    "sender_name": "Jennifer Williams, Esq.",
    "recipient_name": "ABC Corporation Legal Department",
    "recipient_address": "123 Business Ave, Suite 500, New York, NY 10001",
    "incident_date": "2024-03-15",
    "amount_demanded": 50000,
    "deadline_date": "2024-06-30",
    "payment_method": "wire_transfer"
  }
}
```

**Step 3: Export to HTML for email**
```json
POST /api/docgen/documents/generated-uuid/export
{
  "format": "html"
}
```

---

### Example 3: Generate a Legal Memorandum

**Step 1: Find the brief template**
```json
GET /api/docgen/templates?category=brief&search=memorandum
```

**Step 2: Generate with case reference**
```json
POST /api/docgen/generate
{
  "templateId": "memo-template-uuid",
  "variables": {
    "case_name": "Johnson v. Smith",
    "court_name": "Superior Court of California",
    "case_number": "2024-CV-12345",
    "memorandum_date": "2024-06-04",
    "issue_summary": "Breach of contract regarding software licensing agreement",
    "relief_sought": "Declaratory judgment and damages"
  }
}
```

**Step 3: Export to Markdown for version control**
```json
POST /api/docgen/documents/generated-uuid/export
{
  "format": "markdown"
}
```

---

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `Template not found` | Invalid template ID | Verify template ID or list templates |
| `Required variable missing` | Omitted required field | Provide all required variables |
| `Invalid date format` | Date not ISO 8601 | Use `YYYY-MM-DD` format |
| `Invalid select option` | Value not in options | Use a value from the options list |
| `Document not found` | Invalid document ID | Verify document ID from generation response |

### Error Response Format

```json
{
  "error": "validation_failed",
  "message": "Document generation failed",
  "details": {
    "valid": false,
    "errors": [
      "Required variable \"party_a_name\" is missing"
    ]
  }
}
```

---

## Best Practices

1. **Always validate inputs**: Check that required variables are provided before calling generate
2. **Use ISO 8601 dates**: Format dates as `YYYY-MM-DD` for compatibility
3. **Verify select options**: For `select` type variables, use values from `options[].value`
4. **Store document IDs**: Save the generated document ID for export and retrieval
5. **Choose format wisely**: DOCX for legal review, Markdown for editing, HTML for viewing
6. **Check word count**: Document metadata includes word count for billing/verification
