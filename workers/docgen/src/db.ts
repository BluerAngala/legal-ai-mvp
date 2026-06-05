/**
 * Docgen DB — 模板与生成文档的持久化
 *
 * 重构：用 @legalai/database 替换原硬编码直连。
 */

import { randomUUID } from "node:crypto";
import { query, queryOne } from "@legalai/database";
import type {
	Template,
	TemplateRow,
	TemplateVariable,
	GeneratedDocument,
	GeneratedDocRow,
} from "./types.js";

function mapTemplate(row: TemplateRow): Template {
	return {
		id: row.id,
		name: row.name,
		category: row.category as Template["category"],
		description: row.description ?? "",
		content: row.content,
		variables: row.variables as unknown as TemplateVariable[],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapDoc(row: GeneratedDocRow): GeneratedDocument {
	return {
		id: row.id,
		templateId: row.template_id,
		content: row.content,
		format: row.format as GeneratedDocument["format"],
		variables: row.variables as Record<string, unknown>,
		metadata: row.metadata,
		ownerId: row.owner_id,
		createdAt: row.created_at,
	};
}

export async function listTemplates(params: {
	category?: string;
	search?: string;
	limit?: number;
	offset?: number;
}): Promise<{ templates: Template[]; total: number }> {
	const { category, search, limit = 20, offset = 0 } = params;
	const values: unknown[] = [];
	const where: string[] = ["1=1"];
	if (category) {
		values.push(category);
		where.push(`category = $${values.length}`);
	}
	if (search) {
		values.push(`%${search}%`);
		where.push(
			`(name ILIKE $${values.length} OR description ILIKE $${values.length})`,
		);
	}
	const whereSql = `WHERE ${where.join(" AND ")}`;

	const totalRow = await queryOne<{ count: string }>(
		`SELECT COUNT(*)::text AS count FROM templates ${whereSql}`,
		values,
	);
	const total = Number(totalRow?.count ?? 0);

	values.push(limit, offset);
	const { rows } = await query<TemplateRow>(
		`SELECT * FROM templates ${whereSql} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
		values,
	);
	return { templates: rows.map(mapTemplate), total };
}

export async function getTemplate(id: string): Promise<Template | null> {
	const row = await queryOne<TemplateRow>(
		`SELECT * FROM templates WHERE id = $1`,
		[id],
	);
	return row ? mapTemplate(row) : null;
}

export async function saveGeneratedDocument(input: {
	id: string;
	templateId: string;
	content: string;
	format: "markdown" | "html" | "docx";
	variables: Record<string, unknown>;
	metadata: Record<string, unknown>;
	ownerId: string;
}): Promise<GeneratedDocument> {
	await query(
		`INSERT INTO generated_documents (id, template_id, content, format, variables, metadata, owner_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		[
			input.id,
			input.templateId,
			input.content,
			input.format,
			JSON.stringify(input.variables),
			JSON.stringify(input.metadata),
			input.ownerId,
		],
	);
	const row = await queryOne<GeneratedDocRow>(
		`SELECT * FROM generated_documents WHERE id = $1`,
		[input.id],
	);
	if (!row) throw new Error("Failed to load generated document after insert");
	return mapDoc(row);
}

export async function getGeneratedDocument(
	id: string,
): Promise<GeneratedDocument | null> {
	const row = await queryOne<GeneratedDocRow>(
		`SELECT * FROM generated_documents WHERE id = $1`,
		[id],
	);
	return row ? mapDoc(row) : null;
}

export function newDocId(): string {
	return randomUUID();
}

export interface CreateTemplateInput {
	name: string;
	category: "contract" | "letter" | "report" | "brief";
	content: string;
	variables: Array<{
		name: string;
		type: "text" | "date" | "number" | "select" | "document_ref";
		label: string;
		required: boolean;
		defaultValue?: string | number;
		options?: Array<{ value: string; label: string }>;
		description?: string;
	}>;
	description?: string;
	isPublic?: boolean;
	createdBy?: string;
}

export async function createTemplate(
	input: CreateTemplateInput,
): Promise<Template> {
	const id = randomUUID();
	await query(
		`INSERT INTO templates (id, name, category, description, content, variables, is_public, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		[
			id,
			input.name,
			input.category,
			input.description ?? null,
			input.content,
			JSON.stringify(input.variables),
			input.isPublic ?? false,
			input.createdBy ?? "system",
		],
	);
	const tpl = await getTemplate(id);
	if (!tpl) throw new Error("Failed to load template after insert");
	return tpl;
}
