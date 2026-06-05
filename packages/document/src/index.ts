/**
 * @legalai/document - 文档解析（PDF / DOCX / TXT / MD）
 *
 * 设计：
 *   - 统一接口 parseDocument(buffer, filename) → ParsedDocument
 *   - 解析器工厂按扩展名分发
 *   - 不持有任何默认配置（chunk 大小等由调用方传）
 */

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import mammoth from "mammoth";
import { WorkerError } from "@legalai/core";

export interface ParsedDocument {
	/** 纯文本（已规范化空白） */
	text: string;
	/** 原始元数据（页数、作者等，可选） */
	meta: {
		filename: string;
		size: number;
		mime: string;
		pages?: number;
		author?: string;
		title?: string;
	};
}

export interface ChunkOptions {
	/** 每个 chunk 的目标字符数（默认 800） */
	chunkSize?: number;
	/** 块间重叠字符数（默认 100） */
	overlap?: number;
	/** 段落分隔符（默认双换行） */
	separator?: string;
}

export interface TextChunk {
	index: number;
	text: string;
	startChar: number;
	endChar: number;
}

/* ---------- Mime 推断 ---------- */

const MIME_MAP: Record<string, string> = {
	".pdf": "application/pdf",
	".docx":
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".doc": "application/msword",
	".txt": "text/plain",
	".md": "text/markdown",
	".markdown": "text/markdown",
};

function guessMime(filename: string): string {
	const ext = extname(filename).toLowerCase();
	return MIME_MAP[ext] ?? "application/octet-stream";
}

/* ---------- 解析器 ---------- */

type Parser = (
	buffer: Buffer,
	filename: string,
) => Promise<{ text: string; pages?: number; author?: string; title?: string }>;

const parsers: Record<string, Parser> = {
	".pdf": parsePdf,
	".docx": parseDocx,
	".txt": parseTxt,
	".md": parseTxt,
	".markdown": parseTxt,
};

export async function parseDocument(
	buffer: Buffer,
	filename: string,
): Promise<ParsedDocument> {
	const ext = extname(filename).toLowerCase();
	const parser = parsers[ext];
	if (!parser) {
		throw new WorkerError(
			"document-parser",
			`Unsupported file type: ${ext} (${filename})`,
		);
	}
	const result = await parser(buffer, filename);
	return {
		text: normalizeWhitespace(result.text),
		meta: {
			filename: basename(filename),
			size: buffer.length,
			mime: guessMime(filename),
			pages: result.pages,
			author: result.author,
			title: result.title,
		},
	};
}

export async function parseFile(filePath: string): Promise<ParsedDocument> {
	const buffer = await readFile(filePath);
	return parseDocument(buffer, basename(filePath));
}

/* ---------- 文本归一化 ---------- */

export function normalizeWhitespace(text: string): string {
	return text
		.replace(/\r\n/g, "\n")
		.replace(/\u00A0/g, " ")
		.replace(/[\t ]+/g, " ")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/* ---------- 各解析器实现 ---------- */

async function parseTxt(buffer: Buffer): Promise<{ text: string }> {
	return { text: buffer.toString("utf-8") };
}

async function parseDocx(
	buffer: Buffer,
): Promise<{ text: string; author?: string; title?: string }> {
	const result = await mammoth.extractRawText({ buffer });
	return {
		text: result.value,
		author: undefined,
		title: undefined,
	};
}

async function parsePdf(
	buffer: Buffer,
): Promise<{ text: string; pages?: number }> {
	// pdfjs-dist: 使用 legacy build 兼容 Node
	const pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs") = await import(
		"pdfjs-dist/legacy/build/pdf.mjs"
	);
	const loadingTask = pdfjs.getDocument({
		data: new Uint8Array(buffer),
		useSystemFonts: true,
	});
	const doc = await loadingTask.promise;
	const pageTexts: string[] = [];
	for (let i = 1; i <= doc.numPages; i++) {
		const page = await doc.getPage(i);
		const content = await page.getTextContent();
		const text = content.items
			.map((it) => ("str" in it ? (it as { str: string }).str : ""))
			.join(" ");
		pageTexts.push(text);
	}
	return { text: pageTexts.join("\n\n"), pages: doc.numPages };
}

/* ---------- Chunking ---------- */

export function chunkText(text: string, opts: ChunkOptions = {}): TextChunk[] {
	const chunkSize = opts.chunkSize ?? 800;
	const overlap = opts.overlap ?? 100;
	const separator = opts.separator ?? "\n\n";
	if (!text) return [];

	// 优先按段落切分，再按 chunkSize 合并/分裂
	const paragraphs = text.split(separator).filter((p) => p.trim().length > 0);
	const chunks: TextChunk[] = [];
	let buffer = "";
	let bufferStart = 0;
	let cursor = 0;

	for (const para of paragraphs) {
		if (
			buffer.length + para.length + separator.length > chunkSize &&
			buffer.length > 0
		) {
			chunks.push({
				index: chunks.length,
				text: buffer,
				startChar: bufferStart,
				endChar: cursor,
			});
			// overlap：保留 buffer 末尾
			const tail = buffer.slice(Math.max(0, buffer.length - overlap));
			buffer = tail;
			bufferStart = cursor - tail.length;
		}
		if (para.length > chunkSize) {
			// 长段落硬切
			for (let i = 0; i < para.length; i += chunkSize - overlap) {
				const part = para.slice(i, i + chunkSize);
				chunks.push({
					index: chunks.length,
					text: part,
					startChar: bufferStart,
					endChar: bufferStart + part.length,
				});
				bufferStart += part.length;
			}
			buffer = "";
		} else {
			buffer += (buffer ? separator : "") + para;
			cursor += para.length + (buffer ? separator.length : 0);
		}
	}
	if (buffer.length > 0) {
		chunks.push({
			index: chunks.length,
			text: buffer,
			startChar: bufferStart,
			endChar: bufferStart + buffer.length,
		});
	}
	return chunks;
}
