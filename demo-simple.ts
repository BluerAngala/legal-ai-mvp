/**
 * LegalAI MVP - Simple Demo Server
 * Quick test without full worker setup
 */
import express from 'express';
import { Pool } from 'pg';

const app = express();
app.use(express.json());

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'legalai',
  user: 'postgres',
  password: 'legalai123',
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', database: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', message: String(err) });
  }
});

// List documents
app.get('/documents', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, title, type, status, created_at FROM documents ORDER BY created_at DESC LIMIT 50');
    res.json({ documents: result.rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Upload document (simple text)
app.post('/documents', async (req, res) => {
  try {
    const { title, content, type = 'contract', tags = [] } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'title and content required' });
    }
    const result = await pool.query(
      `INSERT INTO documents (title, content, type, tags, status) 
       VALUES ($1, $2, $3, $4, 'parsed') RETURNING id, title`,
      [title, content, type, tags]
    );
    res.json({ success: true, document: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Search documents
app.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'query q required' });
    
    const result = await pool.query(
      `SELECT id, title, content, ts_rank(to_tsvector('simple', content), plainto_tsquery('simple', $1)) as rank
       FROM documents 
       WHERE to_tsvector('simple', content) @@ plainto_tsquery('simple', $1)
       ORDER BY rank DESC LIMIT 10`,
      [q as string]
    );
    res.json({ results: result.rows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`LegalAI Demo Server running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  GET  /health    - Health check');
  console.log('  GET  /documents - List documents');
  console.log('  POST /documents - Upload document {title, content, type, tags}');
  console.log('  GET  /search?q=  - Search documents');
});
