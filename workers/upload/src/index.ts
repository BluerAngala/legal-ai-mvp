/**
 * Upload Worker - Legal AI MVP
 * Handles document upload and file storage
 */

import { registerWorker, http, type ApiRequest, type ApiResponse } from 'iii-sdk';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const ENGINE_URL = process.env.III_ENGINE_URL ?? 'ws://localhost:49134';
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? join(process.cwd(), 'data', 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// In-memory document registry
interface DocumentRecord {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum: string;
  status: 'pending' | 'stored' | 'error';
  createdAt: string;
}

const documents = new Map<string, DocumentRecord>();

// Validation schemas
const UploadInputSchema = z.object({
  file: z.object({
    data: z.string(),
    filename: z.string(),
    mimeType: z.string().optional(),
  }),
  collectionId: z.string().optional(),
});

const StatusInputSchema = z.object({
  documentId: z.string(),
});

// UUID generator
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Compute file checksum
function computeChecksum(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

// Ensure directory exists
function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

// Validate file size
function validateFileSize(size: number): void {
  if (size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum ${MAX_FILE_SIZE}`);
  }
}

// ============================================================================
// Worker Functions
// ============================================================================

async function uploadCreate(input: unknown) {
  const parsed = UploadInputSchema.parse(input);
  const documentId = generateId();

  const buffer = Buffer.from(parsed.file.data, 'base64');
  validateFileSize(buffer.length);

  const checksum = computeChecksum(buffer);
  const mimeType = parsed.file.mimeType ?? 'application/octet-stream';

  ensureDir(UPLOADS_DIR);
  const dirPath = join(UPLOADS_DIR, documentId);
  ensureDir(dirPath);
  const filePath = join(dirPath, parsed.file.filename);
  writeFileSync(filePath, buffer);

  const record: DocumentRecord = {
    id: documentId,
    filename: parsed.file.filename,
    mimeType,
    size: buffer.length,
    checksum,
    status: 'stored',
    createdAt: new Date().toISOString(),
  };
  documents.set(documentId, record);

  return {
    documentId,
    status: record.status,
    filename: record.filename,
    size: record.size,
    checksum: record.checksum,
  };
}

async function uploadStatus(input: unknown) {
  const { documentId } = StatusInputSchema.parse(input);
  const record = documents.get(documentId);

  if (!record) {
    throw new Error(`Document not found: ${documentId}`);
  }

  return {
    documentId: record.id,
    status: record.status,
    filename: record.filename,
    size: record.size,
    createdAt: record.createdAt,
  };
}

async function uploadDelete(input: unknown) {
  const { documentId } = StatusInputSchema.parse(input);
  const record = documents.get(documentId);

  if (!record) {
    throw new Error(`Document not found: ${documentId}`);
  }

  const dirPath = join(UPLOADS_DIR, documentId);
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true });
  }

  documents.delete(documentId);

  return {
    documentId,
    deleted: true,
    message: 'Document deleted successfully',
  };
}

// ============================================================================
// HTTP Handlers
// ============================================================================

const handleUpload = http(async (req) => {
  try {
    const body = req.body as Record<string, unknown>;

    if (!body.file || typeof body.file !== 'object') {
      return { status_code: 400, body: { error: 'Missing file' } };
    }

    const fileData = body.file as { data?: string; filename?: string; mimeType?: string };

    if (!fileData.data || !fileData.filename) {
      return { status_code: 400, body: { error: 'File data and filename required' } };
    }

    const result = await uploadCreate({
      file: {
        data: fileData.data,
        filename: fileData.filename,
        mimeType: fileData.mimeType,
      },
      collectionId: body.collectionId as string | undefined,
    });

    return { status_code: 201, body: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return { status_code: 500, body: { error: message } };
  }
});

const handleGetDocument = http(async (req) => {
  try {
    const documentId = req.path_params?.id;

    if (!documentId) {
      return { status_code: 400, body: { error: 'Document ID required' } };
    }

    const result = await uploadStatus({ documentId });
    return { status_code: 200, body: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed';
    if (message.includes('not found')) {
      return { status_code: 404, body: { error: message } };
    }
    return { status_code: 500, body: { error: message } };
  }
});

// ============================================================================
// Worker Registration
// ============================================================================

const sdk = registerWorker(ENGINE_URL, {
  workerName: 'upload-worker',
});

// Register functions
sdk.registerFunction('upload::create', uploadCreate);
sdk.registerFunction('upload::status', uploadStatus);
sdk.registerFunction('upload::delete', uploadDelete);

// Register HTTP triggers
sdk.registerTrigger({
  type: 'http',
  function_id: 'upload::create',
  config: { api_path: '/api/documents/upload', http_method: 'POST' },
});

sdk.registerTrigger({
  type: 'http',
  function_id: 'upload::status',
  config: { api_path: '/api/documents/:id', http_method: 'GET' },
});

sdk.registerTrigger({
  type: 'http',
  function_id: 'upload::delete',
  config: { api_path: '/api/documents/:id', http_method: 'DELETE' },
});

console.log('Upload worker registered');
console.log(`Engine URL: ${ENGINE_URL}`);
console.log(`Uploads directory: ${UPLOADS_DIR}`);
