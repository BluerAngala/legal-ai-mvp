# Repository Guidelines

## 项目概述

法律 AI MVP — 基于 **iii + pi** 的法律服务AI工具，专注**快**和**准**。

- **快**：BM25 内存索引 + Redis 缓存 + 批量 embedding
- **准**：语义 + BM25 混合检索 + RRF + Zod 质量验证

### 核心功能

- 📄 **知识库管理** - 上传、解析、索引法律文档
- 🔍 **智能检索** - 语义搜索 + 关键词混合检索
- ⚖️ **AI分析** - 合同风险识别、条款对比、法规引用
- 📝 **文档生成** - 模板填充、多格式导出

## 架构

```
┌─────────────────────────────────────────────────────┐
│  pi (coding harness) - 辅助开发                      │
├─────────────────────────────────────────────────────┤
│  前端层                                             │
│    └── 任意 HTTP 客户端 / CLI / Agent                │
├─────────────────────────────────────────────────────┤
│  API Gateway (iii http-trigger)                      │
├─────────────────────────────────────────────────────┤
│  Workers:                                           │
│    upload-worker    → 文件上传                       │
│    document-worker  → 解析、chunk、embedding         │
│    knowledge-worker → 检索 + 缓存                    │
│    analysis-worker  → LLM 分析                       │
│    docgen-worker   → 文档生成                       │
├─────────────────────────────────────────────────────┤
│  存储层                                             │
│    PostgreSQL         → 关系数据 + 全文搜索 (JSONB)   │
│    Redis              → 缓存                        │
└─────────────────────────────────────────────────────┘
```

## 关键目录

| 目录 | 用途 |
|------|------|
| `workers/upload/` | 文件上传、存储、UUID 生成、SHA256 校验 |
| `workers/document/` | PDF/DOCX 解析、文本 chunking、OpenAI embedding |
| `workers/knowledge/` | 混合检索（语义+BM25）、RRF 融合、Redis 缓存 |
| `workers/analysis/` | Claude LLM 分析：摘要/风险审查/条款对比/QA |
| `workers/docgen/` | 模板文档生成：Markdown/HTML/DOCX 导出 |
| `config/` | iii 引擎配置、数据库 schema、LLM 提供商配置 |
| `skills/` | AI Skill 定义（legal-knowledge、legal-analysis、legal-docgen） |

## 开发命令

### npm 脚本（根目录）

```bash
npm run start:all   # 启动所有服务 + Workers
npm run dev         # 开发模式
npm run start       # 生产启动
npm run console     # iii 控制台
npm run test        # Vitest 测试
npm run lint        # Biome 检查
npm run format      # 代码格式化
```

### 跨平台启动脚本

```bash
node scripts/start.js              # 启动所有
node scripts/start.js --services   # 仅启动服务
node scripts/start.js --workers    # 仅启动 Workers
node scripts/start.js --help       # 显示帮助
```

## 代码规范

### Engine URL 配置（所有 Worker 必须一致）

```typescript
const ENGINE_URL = process.env.III_ENGINE_URL ?? process.env.ENGINE_URL ?? 'ws://localhost:49134';
const sdk = registerWorker(ENGINE_URL, { workerName: 'xxx-worker' });
```

### 数据库配置（统一凭证）

```typescript
// PostgreSQL 配置
{
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'legalai',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'legalai123',
}

// 或使用 DATABASE_URL
DATABASE_URL=postgresql://postgres:legalai123@localhost:5432/legalai
```

## 重要文件

### Worker 入口点

| 文件 | 状态 |
|------|------|
| `workers/upload/src/index.ts` | ✅ |
| `workers/document/src/index.ts` | ✅ |
| `workers/knowledge/src/index.ts` | ✅ |
| `workers/analysis/src/index.ts` | ✅ |
| `workers/docgen/src/index.ts` | ✅ |

### 配置文件

| 文件 | 用途 |
|------|------|
| `config/iii-config.yaml` | iii 引擎：HTTP 3111，WS 49134，50MB 上传 |
| `config/init.sql` | PostgreSQL Schema（documents, chunks, collections 等） |
| `config/llm-providers.ts` | 多 LLM 提供商配置 |
| `.env.example` | 环境变量模板 |

## 运行时与工具链

| 项目 | 配置 |
|------|------|
| 运行时 | Node.js >= 20 |
| 包管理器 | npm |
| Worker 框架 | iii-sdk |
| 代码检查 | Biome |
| 测试 | Vitest |

## 环境变量

参考 `.env.example`：

```bash
# iii 引擎（WebSocket）
III_ENGINE_URL=ws://localhost:49134

# 数据库
DATABASE_URL=postgresql://postgres:legalai123@localhost:5432/legalai
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=legalai
POSTGRES_USER=postgres
POSTGRES_PASSWORD=legalai123

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# LLM
LLM_API_KEY=<your-api-key>
LLM_PROVIDER=siliconflow
```

## 性能目标

| 操作 | 目标 |
|------|------|
| 检索响应 | < 500ms |
| 文档解析(10页PDF) | < 3s |
| 风险分析(标准合同) | < 10s |
| 文档生成 | < 5s |

## 数据库连接

- **Host**: localhost
- **Port**: 5432
- **Database**: legalai
- **User**: postgres
- **Password**: legalai123
