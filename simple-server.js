/**
 * LegalAI MVP - 法律AI知识库
 * 硅基流动 MiniMax-M2.5 模型
 */
import express from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { createClient } from '@redis/client';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));

// 静态文件
const htmlPath = join(__dirname, 'index.html');
if (fs.existsSync(htmlPath)) {
    app.use(express.static(__dirname));
    app.get('/', (req, res) => res.sendFile(htmlPath));
}

// ============ 数据库 ============
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'legalai',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'legalai123',
});

// ============ LLM ============
const openai = new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: 'https://api.siliconflow.cn/v1',
});

// ============ Redis ============
const redis = createClient({
    socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
    },
});
redis.connect().catch(console.error);

// ============ 健康检查 ============
app.get('/health', async (req, res) => {
    try {
        const [dbResult, redisResult] = await Promise.all([
            pool.query('SELECT NOW()'),
            redis.ping(),
        ]);
        res.json({ 
            status: 'ok', 
            database: dbResult.rows[0].now,
            redis: redisResult,
            llm: 'siliconflow (MiniMax/M2.5)'
        });
    } catch (err) {
        res.status(500).json({ status: 'error', error: String(err) });
    }
});

// ============ 上传文档 ============
app.post('/documents', async (req, res) => {
    try {
        const { title, content, type = 'other', tags = [] } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'title and content required' });
        }

        const id = uuidv4();
        await pool.query(
            `INSERT INTO documents (id, title, content, type, tags) 
             VALUES ($1, $2, $3, $4, $5)`,
            [id, title, content, type, tags]
        );

        res.json({ success: true, id, title });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: String(err) });
    }
});

// ============ 文档列表 ============
app.get('/documents', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, title, type, tags, created_at FROM documents ORDER BY created_at DESC'
        );
        res.json({ documents: result.rows });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

// ============ 关键词搜索 ============
app.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json({ results: [], query: '' });

        const result = await pool.query(
            `SELECT id, title, content, type,
             LENGTH(content) - LENGTH(REPLACE(content, $1, '')) as match_count
             FROM documents 
             WHERE content ILIKE '%' || $1 || '%'
             ORDER BY match_count DESC
             LIMIT 20`,
            [q]
        );

        res.json({ results: result.rows, query: q });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: String(err) });
    }
});

// ============ AI 智能问答 (带对话历史) ============
app.post('/ask', async (req, res) => {
    try {
        const { question, history = [] } = req.body;
        if (!question) return res.status(400).json({ error: 'question required' });

        // 自动搜索相关文档
        const relatedDocs = await pool.query(
            `SELECT title, content FROM documents 
             WHERE content ILIKE '%' || $1 || '%'
             LIMIT 3`,
            [question]
        );
        
        let contextDocs = '';
        if (relatedDocs.rows.length > 0) {
            contextDocs = '【知识库相关文档】\n' + 
                relatedDocs.rows.map(r => `■ ${r.title}\n${r.content}`).join('\n\n');
        }

        // 构建消息
        const messages = [
            {
                role: 'system',
                content: '你是一个专业的法律AI助手，用简洁专业的语言回答法律问题。如果知识库有相关内容，优先依据文档回答；如果没有，用你的法律知识回答并说明。回答格式清晰，使用适当的markdown。'
            }
        ];

        // 添加历史对话
        history.slice(-8).forEach(msg => {
            messages.push({ role: msg.role, content: msg.content });
        });

        // 当前问题
        const userContent = contextDocs 
            ? `${contextDocs}\n\n【用户问题】\n${question}`
            : `【用户问题】\n${question}`;

        messages.push({ role: 'user', content: userContent });

        const completion = await openai.chat.completions.create({
            model: 'MiniMaxAI/MiniMax-M2.5',
            messages,
            max_tokens: 1200,
        });

        res.json({
            answer: completion.choices[0].message.content,
            model: 'MiniMaxAI/MiniMax-M2.5',
            provider: '硅基流动',
            sources: relatedDocs.rows.map(r => r.title)
        });
    } catch (err) {
        console.error('Ask error:', err);
        res.status(500).json({ error: String(err) });
    }
});

// ============ 风险分析 ============
app.post('/analyze', async (req, res) => {
    try {
        const { documentId, content } = req.body;
        
        let text = content;
        if (documentId && !content) {
            const result = await pool.query('SELECT content FROM documents WHERE id = $1', [documentId]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Document not found' });
            }
            text = result.rows[0].content;
        }
        
        if (!text) {
            return res.status(400).json({ error: 'content required' });
        }

        const completion = await openai.chat.completions.create({
            model: 'MiniMaxAI/MiniMax-M2.5',
            messages: [
                {
                    role: 'system',
                    content: `你是一个专业的法律风险分析师。请分析合同中的法律风险，包括但不限于：
1. 主体资格风险（当事人信息是否完整）
2. 标的物风险（标的物描述是否清晰）
3. 权利义务风险（双方权利义务是否对等）
4. 违约责任风险（违约金是否合理）
5. 适用法律风险（管辖约定是否合理）
6. 其他风险（遗漏的重要条款）

请用结构化的Markdown格式输出分析结果，突出显示高风险项。`
                },
                {
                    role: 'user',
                    content: `请分析以下合同的风险：\n\n${text}`
                }
            ],
            max_tokens: 1500,
        });

        res.json({
            analysis: completion.choices[0].message.content,
            documentId: documentId || 'inline',
            model: 'MiniMaxAI/MiniMax-M2.5'
        });
    } catch (err) {
        console.error('Analyze error:', err);
        res.status(500).json({ error: String(err) });
    }
});

// ============ 启动 ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║         LegalAI MVP Server 启动成功!                   ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║  地址: http://localhost:${PORT}                          ║`);
    console.log('║  LLM: 硅基流动 (MiniMaxAI/MiniMax-M2.5)              ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log('║  API 接口:                                           ║');
    console.log('║    GET  /health        - 健康检查                     ║');
    console.log('║    POST /documents     - 上传文档 {title,content}    ║');
    console.log('║    GET  /documents     - 文档列表                     ║');
    console.log('║    GET  /search?q=     - 关键词搜索                  ║');
    console.log('║    POST /ask           - AI问答 {question,history?}  ║');
    console.log('║    POST /analyze       - 文档分析 {documentId}       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
});
