import pg from 'pg';
import type {
  Template,
  TemplateRow,
  TemplateVariable,
  GeneratedDocRow,
  GeneratedDocument,
} from './types.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/legal_ai',
});

export async function listTemplates(params: {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ templates: Template[]; total: number }> {
  const { category, search, limit = 20, offset = 0 } = params;

  let query = 'SELECT * FROM templates WHERE 1=1';
  const values: unknown[] = [];
  let paramIndex = 1;

  if (category) {
    query += ` AND category = $${paramIndex++}`;
    values.push(category);
  }

  if (search) {
    query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
    values.push(`%${search}%`);
    paramIndex++;
  }

  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
  const countResult = await pool.query(countQuery, values);
  const total = parseInt(countResult.rows[0].count, 10);

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  values.push(limit, offset);

  const result = await pool.query<TemplateRow>(query, values);
  return {
    templates: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category as Template['category'],
      content: row.content,
      variables: row.variables as TemplateVariable[],
      description: row.description ?? undefined,
      isPublic: row.is_public,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    total,
  };
}

export async function getTemplate(id: string): Promise<Template | null> {
  const result = await pool.query<TemplateRow>(
    'SELECT * FROM templates WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    category: row.category as Template['category'],
    content: row.content,
    variables: row.variables as TemplateVariable[],
    description: row.description ?? undefined,
    isPublic: row.is_public,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getTemplateVariables(
  templateId: string
): Promise<TemplateVariable[]> {
  const template = await getTemplate(templateId);
  return template?.variables ?? [];
}

export async function saveGeneratedDocument(params: {
  id: string;
  templateId: string;
  content: string;
  format: string;
  variables: Record<string, unknown>;
  metadata: Record<string, unknown>;
  ownerId: string;
}): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO generated_documents (id, template_id, content, format, variables, metadata, owner_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      params.id,
      params.templateId,
      params.content,
      params.format,
      JSON.stringify(params.variables),
      JSON.stringify(params.metadata),
      params.ownerId,
    ]
  );

  return result.rows[0].id;
}

export async function getGeneratedDocument(
  id: string
): Promise<GeneratedDocument | null> {
  const result = await pool.query<GeneratedDocRow & { template_name: string }>(
    `SELECT gd.*, t.name as template_name
     FROM generated_documents gd
     JOIN templates t ON gd.template_id = t.id
     WHERE gd.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0];
  const meta = row.metadata as { generatedAt?: string; generatedBy?: string; wordCount?: number };
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    content: row.content,
    format: row.format as GeneratedDocument['format'],
    variables: row.variables,
    metadata: {
      generatedAt: meta.generatedAt ? new Date(meta.generatedAt) : row.created_at,
      generatedBy: meta.generatedBy || 'unknown',
      wordCount: meta.wordCount || 0,
    },
  };
}

export async function createTemplate(params: {
  name: string;
  category: Template['category'];
  content: string;
  variables: TemplateVariable[];
  description?: string;
  isPublic?: boolean;
  createdBy: string;
}): Promise<Template> {
  const result = await pool.query<TemplateRow>(
    `INSERT INTO templates (name, category, content, variables, description, is_public, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.name,
      params.category,
      params.content,
      JSON.stringify(params.variables),
      params.description ?? null,
      params.isPublic ?? false,
      params.createdBy,
    ]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    category: row.category as Template['category'],
    content: row.content,
    variables: row.variables as TemplateVariable[],
    description: row.description ?? undefined,
    isPublic: row.is_public,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateTemplate(
  id: string,
  params: Partial<{
    name: string;
    category: Template['category'];
    content: string;
    variables: TemplateVariable[];
    description: string;
    isPublic: boolean;
  }>
): Promise<Template | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(params.name);
  }
  if (params.category !== undefined) {
    updates.push(`category = $${paramIndex++}`);
    values.push(params.category);
  }
  if (params.content !== undefined) {
    updates.push(`content = $${paramIndex++}`);
    values.push(params.content);
  }
  if (params.variables !== undefined) {
    updates.push(`variables = $${paramIndex++}`);
    values.push(JSON.stringify(params.variables));
  }
  if (params.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(params.description);
  }
  if (params.isPublic !== undefined) {
    updates.push(`is_public = $${paramIndex++}`);
    values.push(params.isPublic);
  }

  if (updates.length === 0) {
    return getTemplate(id);
  }

  values.push(id);
  const result = await pool.query<TemplateRow>(
    `UPDATE templates SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    category: row.category as Template['category'],
    content: row.content,
    variables: row.variables as TemplateVariable[],
    description: row.description ?? undefined,
    isPublic: row.is_public,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM templates WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool };
