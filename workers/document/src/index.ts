import { registerWorker } from 'iii-sdk';
import { z } from 'zod';
import { Pool } from 'pg';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'fs';

const ENGINE_URL = process.env.ENGINE_URL || 'http://localhost:4000';

const sdk = registerWorker(ENGINE_URL, { workerName: 'document-worker' });

// ============================================================================
// Configuration
// ============================================================================

const config = {
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'legal_ai',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 1536,
  },
  chunking: {
    tokensPerChunk: 1000,
    tokenOverlap: 200,
    charsPerToken: 4, // Approximate ratio
  },
};

// ============================================================================
// Database Client
// ============================================================================

const pool = new Pool(config.database);

async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

// ============================================================================
// OpenAI Client
// ============================================================================

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

// ============================================================================
// Schema Definitions
// ============================================================================

const ParseInputSchema = z.object({
  documentId: z.string().uuid(),
  fileBuffer: z.instanceof(Buffer),
  mimeType: z.string(),
  filename: z.string(),
});

const ChunkInputSchema = z.object({
  documentId: z.string().uuid(),
  text: z.string(),
});

const EmbedInputSchema = z.object({
  documentId: z.string().uuid(),
  chunks: z.array(z.object({
    id: z.string().uuid(),
    content: z.string(),
    chunkIndex: z.number(),
  })),
});

// ============================================================================
// Document Parsing
// ============================================================================

interface ParseResult {
  text: string;
  metadata: {
    pageCount?: number;
    info?: Record<string, unknown>;
  };
}

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    metadata: {
      pageCount: data.numpages,
      info: data.info,
    },
  };
}

async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: result.value,
    metadata: {},
  };
}

async function parseDocument(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ParseResult> {
  if (mimeType === 'application/pdf') {
    return parsePdf(fileBuffer);
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return parseDocx(fileBuffer);
  } else {
    throw new Error(`Unsupported mime type: ${mimeType}`);
  }
}

// ============================================================================
// Text Chunking
// ============================================================================

interface Chunk {
  id: string;
  content: string;
  chunkIndex: number;
}

function chunkText(text: string, tokensPerChunk: number, tokenOverlap: number): Chunk[] {
  const charsPerChunk = tokensPerChunk * config.chunking.charsPerToken;
  const charsOverlap = tokenOverlap * config.chunking.charsPerToken;
  
  // Clean and normalize text
  const cleanedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  if (!cleanedText) {
    return [];
  }
  
  const chunks: Chunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;
  
  while (startIndex < cleanedText.length) {
    // Calculate end index for this chunk
    let endIndex = Math.min(startIndex + charsPerChunk, cleanedText.length);
    
    // If not at the end, try to break at a sentence or paragraph boundary
    if (endIndex < cleanedText.length) {
      // Look for paragraph break first (\n\n)
      const paragraphBreak = cleanedText.lastIndexOf('\n\n', endIndex);
      if (paragraphBreak > startIndex + charsPerChunk / 2) {
        endIndex = paragraphBreak + 2;
      } else {
        // Look for sentence break
        const sentenceBreak = cleanedText.lastIndexOf('. ', endIndex);
        if (sentenceBreak > startIndex + charsPerChunk / 2) {
          endIndex = sentenceBreak + 2;
        }
      }
    }
    
    const chunkContent = cleanedText.slice(startIndex, endIndex).trim();
    
    if (chunkContent) {
      chunks.push({
        id: uuidv4(),
        content: chunkContent,
        chunkIndex: chunkIndex++,
      });
    }
    
    // Move start index with overlap
    startIndex = endIndex - charsOverlap;
    
    // Ensure we make progress
    if (startIndex <= 0 || startIndex >= cleanedText.length) {
      break;
    }
  }
  
  return chunks;
}

// ============================================================================
// Embedding Generation
// ============================================================================

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: config.openai.embeddingModel,
    input: text,
    dimensions: config.openai.embeddingDimensions,
  });
  
  return response.data[0].embedding;
}

async function generateEmbeddings(chunks: Chunk[]): Promise<Map<string, number[]>> {
  const embeddings = new Map<string, number[]>();
  
  // Process in batches to avoid rate limits
  const batchSize = 100;
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    const texts = batch.map(c => c.content);
    const response = await openai.embeddings.create({
      model: config.openai.embeddingModel,
      input: texts,
      dimensions: config.openai.embeddingDimensions,
    });
    
    for (let j = 0; j < batch.length; j++) {
      embeddings.set(batch[j].id, response.data[j].embedding);
    }
  }
  
  return embeddings;
}

// ============================================================================
// Database Operations
// ============================================================================

interface DocumentRecord {
  id: string;
  status: string;
}

interface ChunkRecord {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  embedding: string;
  metadata: Record<string, unknown>;
}

async function saveChunksToDatabase(
  documentId: string,
  chunks: Chunk[],
  embeddings: Map<string, number[]>
): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Insert chunks
    for (const chunk of chunks) {
      const embedding = embeddings.get(chunk.id);
      if (!embedding) continue;
      
      await client.query<ChunkRecord>(
        `INSERT INTO document_chunks (id, document_id, content, chunk_index, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          chunk.id,
          documentId,
          chunk.content,
          chunk.chunkIndex,
          `[${embedding.join(',')}]`,
          JSON.stringify({ tokens: estimateTokens(chunk.content) }),
        ]
      );
    }
    
    // Update document status to 'indexed'
    await client.query<DocumentRecord>(
      `UPDATE documents SET status = 'indexed', indexed_at = NOW() WHERE id = $1`,
      [documentId]
    );
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateDocumentStatus(
  documentId: string,
  status: 'parsed' | 'indexed' | 'error',
  errorMessage?: string
): Promise<void> {
  await query(
    `UPDATE documents SET status = $1, error_message = $2 WHERE id = $3`,
    [status, errorMessage || null, documentId]
  );
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English text
  return Math.ceil(text.length / config.chunking.charsPerToken);
}

// ============================================================================
// Function Registration
// ============================================================================

// document::parse - Parse PDF/Word files and extract text
sdk.registerFunction('document::parse', async (input: { documentId: string; fileBuffer: Buffer; mimeType: string; filename: string }) => {
  const { documentId, fileBuffer, mimeType, filename } = input;
  
  console.log(`Parsing document: ${filename} (${documentId})`);
  
  const result = await parseDocument(fileBuffer, mimeType);
  
  return {
    documentId,
    text: result.text,
    metadata: result.metadata,
  };
});

// document::chunk - Split text into semantic chunks
sdk.registerFunction('document::chunk', async (input: { documentId: string; text: string }) => {
  const { documentId, text } = input;
  
  console.log(`Chunking document: ${documentId}`);
  
  const chunks = chunkText(
    text,
    config.chunking.tokensPerChunk,
    config.chunking.tokenOverlap
  );
  
  return {
    documentId,
    chunks,
    totalChunks: chunks.length,
  };
});

// document::embed - Generate embeddings for text chunks
sdk.registerFunction('document::embed', async (input: { documentId: string; chunks: Chunk[] }) => {
  const { documentId, chunks } = input;
  
  console.log(`Generating embeddings for ${chunks.length} chunks of document: ${documentId}`);
  
  const embeddingsArray = await generateEmbeddings(chunks);
  
  const embeddings = chunks.map((chunk) => ({
    chunkId: chunk.id,
    embedding: embeddingsArray.get(chunk.id) || [],
  }));
  
  return {
    documentId,
    embeddings,
  };
});

// document::enqueue - Add document to processing queue
sdk.registerFunction('document::enqueue', async (input: { documentId: string; fileBuffer: Buffer; mimeType: string; filename: string; filePath?: string }) => {
  const { documentId, fileBuffer, mimeType, filename, filePath } = input;
  
  console.log(`Enqueueing document: ${filename} (${documentId})`);
  
  // Read file from path if not provided as buffer
  const buffer = fileBuffer || (filePath ? readFileSync(filePath) : Buffer.alloc(0));
  
  // Step 1: Parse document
  console.log(`Parsing document: ${documentId}`);
  const parseResult = await parseDocument(buffer, mimeType);
  
  // Update status to 'parsed'
  await updateDocumentStatus(documentId, 'parsed');
  
  // Step 2: Chunk text
  console.log(`Chunking document: ${documentId}`);
  const chunks = chunkText(
    parseResult.text,
    config.chunking.tokensPerChunk,
    config.chunking.tokenOverlap
  );
  
  if (chunks.length === 0) {
    await updateDocumentStatus(documentId, 'error', 'No content extracted from document');
    return {
      documentId,
      queued: false,
      queueName: 'document::enqueue',
      error: 'No content extracted from document',
    };
  }
  
  console.log(`Generated ${chunks.length} chunks for document: ${documentId}`);
  
  // Step 3: Generate embeddings
  console.log(`Generating embeddings for document: ${documentId}`);
  const embeddings = await generateEmbeddings(chunks);
  
  // Step 4: Save to database
  console.log(`Saving chunks to database for document: ${documentId}`);
  await saveChunksToDatabase(documentId, chunks, embeddings);
  
  console.log(`Successfully processed document: ${documentId}`);
  
  return {
    documentId,
    queued: true,
    queueName: 'document::enqueue',
    totalChunks: chunks.length,
  };
});

// ============================================================================
// HTTP Trigger Registration
// ============================================================================

sdk.registerTrigger({
  type: 'http',
  function_id: 'document::parse',
  config: {
    api_path: '/api/document/parse',
    http_method: 'POST',
  },
});
