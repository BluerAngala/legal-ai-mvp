import { registerWorker } from 'iii-sdk';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import * as db from './db.js';
import { validateVariables, fillTemplate, extractVariables } from './engine.js';
import { exportDocument } from './exporters.js';
import type {
  Template,
  ExportFormat,
} from './types.js';

const ENGINE_URL = process.env.III_ENGINE_URL ?? process.env.ENGINE_URL ?? 'ws://localhost:49134';
const sdk = registerWorker(ENGINE_URL, {
  workerName: 'docgen-worker',
});
// Validation schemas
const listTemplatesSchema = z.object({
  category: z.enum(['contract', 'letter', 'report', 'brief']).optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

const generateSchema = z.object({
  templateId: z.string().uuid(),
  variables: z.record(z.unknown()),
  ownerId: z.string().optional().default('system'),
});

const exportSchema = z.object({
  documentId: z.string().uuid(),
  format: z.enum(['markdown', 'html', 'docx']),
});

// ============================================
// III Engine Functions
// ============================================

// List available templates
sdk.registerFunction('docgen::list_templates', async (input: unknown) => {
  const parsed = listTemplatesSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(`Invalid arguments: ${parsed.error.message}`);
  }

  const params = parsed.data;
  const result = await db.listTemplates({
    category: params.category,
    search: params.search,
    limit: params.limit,
    offset: params.offset,
  });

  return {
    templates: result.templates,
    total: result.total,
    limit: params.limit,
    offset: params.offset,
  };
});

// Get template details
sdk.registerFunction('docgen::get_template', async (input: unknown) => {
  const schema = z.object({
    id: z.string().uuid(),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid arguments: ${parsed.error.message}`);
  }

  const template = await db.getTemplate(parsed.data.id);

  if (!template) {
    throw new Error(`Template not found: ${parsed.data.id}`);
  }

  return template;
});

// Generate document from template
sdk.registerFunction('docgen::generate', async (input: unknown) => {
  const parsed = generateSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(`Invalid arguments: ${parsed.error.message}`);
  }

  const { templateId, variables, ownerId } = parsed.data;

  // Get template
  const template = await db.getTemplate(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  // Validate required variables
  const validation = validateVariables(variables, template.variables);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  // Fill template
  const content = fillTemplate(template, variables);

  // Calculate word count
  const wordCount = content.replace(/\s/g, '').length;

  // Generate document ID
  const docId = uuidv4();

  // Save to database
  await db.saveGeneratedDocument({
    id: docId,
    templateId: template.id,
    content,
    format: 'markdown',
    variables,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: ownerId,
      wordCount,
    },
    ownerId,
  });

  return {
    id: docId,
    templateId: template.id,
    templateName: template.name,
    content,
    format: 'markdown',
    variables,
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: ownerId,
      wordCount,
    },
  };
});

// Export document to different format
sdk.registerFunction('docgen::export', async (input: unknown) => {
  const parsed = exportSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(`Invalid arguments: ${parsed.error.message}`);
  }

  const { documentId, format } = parsed.data;

  const doc = await db.getGeneratedDocument(documentId);
  if (!doc) {
    throw new Error(`Generated document not found: ${documentId}`);
  }

  const exported = await exportDocument(doc, format);

  return {
    content: exported.content instanceof Buffer ? exported.content.toString('base64') : exported.content,
    mimeType: exported.mimeType,
    extension: exported.extension,
    format,
    documentId,
  };
});

// ============================================
// HTTP Triggers
// ============================================

// GET /api/templates - List templates
sdk.registerTrigger({
  type: 'http',
  function_id: 'docgen::list_templates',
  config: {
    api_path: '/api/templates',
    http_method: 'GET',
  },
});

// POST /api/docgen/generate - Generate document
sdk.registerTrigger({
  type: 'http',
  function_id: 'docgen::generate',
  config: {
    api_path: '/api/docgen/generate',
    http_method: 'POST',
  },
});

// GET /api/docgen/export/:id - Export document
sdk.registerTrigger({
  type: 'http',
  function_id: 'docgen::export',
  config: {
    api_path: '/api/docgen/export/:id',
    http_method: 'GET',
  },
});

// GET /api/templates/:id - Get template details
sdk.registerTrigger({
  type: 'http',
  function_id: 'docgen::get_template',
  config: {
    api_path: '/api/templates/:id',
    http_method: 'GET',
  },
});

// POST /api/templates - Create new template
sdk.registerFunction('docgen::create_template', async (input: unknown) => {
  const createSchema = z.object({
    name: z.string().min(1).max(200),
    category: z.enum(['contract', 'letter', 'report', 'brief']),
    content: z.string().min(1),
    variables: z.array(
      z.object({
        name: z.string(),
        type: z.enum(['text', 'date', 'number', 'select', 'document_ref']),
        label: z.string(),
        required: z.boolean(),
        defaultValue: z.union([z.string(), z.number()]).optional(),
        options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
        description: z.string().optional(),
      })
    ),
    description: z.string().optional(),
    isPublic: z.boolean().optional().default(false),
    createdBy: z.string().optional().default('system'),
  });

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid request body: ${parsed.error.errors.map(e => e.message).join(', ')}`);
  }

  const template = await db.createTemplate(parsed.data);
  return template;
});

// Register create_template HTTP trigger
sdk.registerTrigger({
  type: 'http',
  function_id: 'docgen::create_template',
  config: {
    api_path: '/api/templates',
    http_method: 'POST',
  },
});

export {};
