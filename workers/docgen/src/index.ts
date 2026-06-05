/**
 * Docgen Worker — 模板管理 + 文档生成 + 导出
 *
 * 重构：DB 走 @legalai/database，配置走 @legalai/config
 */

import { init } from "iii-sdk";
import { z } from "zod";
import { loadConfig } from "@legalai/config";
import { WorkerError, createLogger, unwrapApiRequest, wrapApiResponse } from "@legalai/core";
import * as db from "./db.js";
import { validateVariables, fillTemplate, extractVariables } from "./engine.js";
import { exportDocument } from "./exporters.js";

const cfg = loadConfig();
const log = createLogger("docgen-worker");

const ENGINE_URL = cfg.engine.url;
const sdk = init(ENGINE_URL, { workerName: cfg.engine.workerName });

/* ---------- Schemas ---------- */

const listTemplatesSchema = z.object({
	category: z.enum(["contract", "letter", "report", "brief"]).optional(),
	search: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(20),
	offset: z.number().int().min(0).default(0),
});

const generateSchema = z.object({
	templateId: z.string().uuid(),
	variables: z.record(z.unknown()),
	ownerId: z.string().default("system"),
});

const exportSchema = z.object({
	documentId: z.string().uuid(),
	format: z.enum(["markdown", "html", "docx"]),
});

const getTemplateSchema = z.object({ id: z.string().uuid() });

const createTemplateSchema = z.object({
	name: z.string().min(1).max(200),
	category: z.enum(["contract", "letter", "report", "brief"]),
	content: z.string().min(1),
	variables: z.array(
		z.object({
			name: z.string(),
			type: z.enum(["text", "date", "number", "select", "document_ref"]),
			label: z.string(),
			required: z.boolean(),
			defaultValue: z.union([z.string(), z.number()]).optional(),
			options: z
				.array(z.object({ value: z.string(), label: z.string() }))
				.optional(),
			description: z.string().optional(),
		}),
	),
	description: z.string().optional(),
	isPublic: z.boolean().default(false),
	createdBy: z.string().default("system"),
});

/* ---------- Functions ---------- */

async function listTemplates(input: unknown) {
	const data = unwrapApiRequest(input);
	const args = listTemplatesSchema.parse(data ?? {});
	const result = await db.listTemplates(args);
	return {
		templates: result.templates,
		total: result.total,
		limit: args.limit,
		offset: args.offset,
	};
}

async function getTemplate(input: unknown) {
	const data = unwrapApiRequest(input);
	const { id } = getTemplateSchema.parse(data);
	const tpl = await db.getTemplate(id);
	if (!tpl)
		throw new WorkerError("docgen", `Template not found: ${id}`, undefined, {
			statusCode: 404,
		});
	return tpl;
}

async function generate(input: unknown) {
	const data = unwrapApiRequest(input);
	const args = generateSchema.parse(data);
	const template = await db.getTemplate(args.templateId);
	if (!template)
		throw new WorkerError(
			"docgen",
			`Template not found: ${args.templateId}`,
			undefined,
			{ statusCode: 404 },
		);

	const validation = validateVariables(args.variables, template.variables);
	if (!validation.valid) {
		throw new WorkerError(
			"docgen",
			`Validation failed: ${validation.errors.join(", ")}`,
			undefined,
			{ statusCode: 400 },
		);
	}

	const content = fillTemplate(template, args.variables);
	const wordCount = content.replace(/\s/g, "").length;
	const id = db.newDocId();

	await db.saveGeneratedDocument({
		id,
		templateId: template.id,
		content,
		format: "markdown",
		variables: args.variables,
		metadata: {
			generatedAt: new Date().toISOString(),
			generatedBy: args.ownerId,
			wordCount,
		},
		ownerId: args.ownerId,
	});

	return {
		id,
		templateId: template.id,
		templateName: template.name,
		content,
		format: "markdown",
		variables: args.variables,
		metadata: {
			generatedAt: new Date().toISOString(),
			generatedBy: args.ownerId,
			wordCount,
		},
	};
}

async function exportDoc(input: unknown) {
	const data = unwrapApiRequest(input);
	const { documentId, format } = exportSchema.parse(data);
	const doc = await db.getGeneratedDocument(documentId);
	if (!doc)
		throw new WorkerError(
			"docgen",
			`Document not found: ${documentId}`,
			undefined,
			{ statusCode: 404 },
		);
	const out = await exportDocument(doc, format);
	return {
		content:
			out.content instanceof Buffer
				? out.content.toString("base64")
				: out.content,
		mimeType: out.mimeType,
		extension: out.extension,
		format,
		documentId,
	};
}

async function createTemplate(input: unknown) {
	const data = unwrapApiRequest(input);
	const args = createTemplateSchema.parse(data);
	// 自动从 content 提取变量，与传入的 variables 合并去重
	const extracted = extractVariables(args.content);
	const existing = new Set(args.variables.map((v) => v.name));
	const merged = [
		...args.variables,
		...extracted
			.filter((n) => !existing.has(n))
			.map((name) => ({
				name,
				type: "text" as const,
				label: name,
				required: false,
			})),
	];
	return db.createTemplate({ ...args, variables: merged });
}

/* ---------- Registration ---------- */

sdk.registerFunction({ id: "docgen::list_templates", description: "List document templates" }, wrapApiResponse(listTemplates));
sdk.registerFunction({ id: "docgen::get_template", description: "Get a template by id" }, wrapApiResponse(getTemplate));
sdk.registerFunction({ id: "docgen::generate", description: "Generate a document from a template" }, wrapApiResponse(generate));
sdk.registerFunction({ id: "docgen::export", description: "Export a generated document" }, wrapApiResponse(exportDoc));
sdk.registerFunction({ id: "docgen::create_template", description: "Create a new template" }, wrapApiResponse(createTemplate));

sdk.registerTrigger({
	type: "http",
	function_id: "docgen::list_templates",
	config: { api_path: "/api/templates", http_method: "GET" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "docgen::get_template",
	config: { api_path: "/api/templates/:id", http_method: "GET" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "docgen::create_template",
	config: { api_path: "/api/templates", http_method: "POST" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "docgen::generate",
	config: { api_path: "/api/docgen/generate", http_method: "POST" },
});
sdk.registerTrigger({
	type: "http",
	function_id: "docgen::export",
	config: { api_path: "/api/docgen/export/:id", http_method: "GET" },
});

log.info("Docgen worker registered", { engine: ENGINE_URL });

export { listTemplates, getTemplate, generate, exportDoc, createTemplate };
