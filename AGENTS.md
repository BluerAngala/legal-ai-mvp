# Repository Guidelines

## 项目概述

法律 AI MVP — 基于 **iii engine + pnpm monorepo** 的法律服务 AI 工具，专注**快**和**准**。

- **快**：BM25 内存索引 + Redis 缓存 + 批量 embedding
- **准**：语义 + BM25 混合检索 + RRF + Zod 质量验证

### 核心功能

- 📄 **知识库管理** - 上传、解析、索引法律文档
- 🔍 **智能检索** - 语义搜索 + 关键词混合检索
- ⚖️ **AI 分析** - 合同风险识别、条款对比、法规引用
- 📝 **文档生成** - 模板填充、多格式导出
- 💬 **法律问答** - 基于 RAG 的对话式法律咨询

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│  pi (coding harness) - 辅助开发                              │
├─────────────────────────────────────────────────────────────┤
│  前端层                                                    │
│    └── 任意 HTTP 客户端 / CLI / Agent                       │
├─────────────────────────────────────────────────────────────┤
│  桌面壳（apps/desktop - Tauri）                              │
│    └── Webview (React + Vite) 通过 HTTP 调用 /api/...       │
│    └── Tauri 仅做窗口壳，不承载业务                         │
├─────────────────────────────────────────────────────────────┤
│  iii Engine (ws://localhost:49134, http://localhost:3111)   │
│    └── Engine 内置：observability / cron / queue / state   │
│    └── HTTP Server: iii-http → :3111                        │
├─────────────────────────────────────────────────────────────┤
│  业务 Workers (7 个 monorepo package)                        │
│    upload-worker     → 文件上传 (POST /api/documents)      │
│    document-worker   → PDF/DOCX 解析、chunking              │
│    knowledge-worker  → 混合检索 (BM25 + 语义) + Redis 缓存  │
│    analysis-worker   → LLM 分析 (风险/摘要/QA/对比)          │
│    docgen-worker     → 模板填充 + 多格式导出                │
│    pi-user           → 用户面 Agent (问答/聊天)             │
│    pi-internal       → 内部 Agent (能力发现 + 任务执行)     │
├─────────────────────────────────────────────────────────────┤
│  共享 Packages (6 个 monorepo package)                        │
│    @legalai/core        → logger, types, 通用工具           │
│    @legalai/config      → Zod 校验的配置加载                │
│    @legalai/database    → pg Pool + migration + query 工具 │
│    @legalai/document    → PDF/DOCX 解析工具                │
│    @legalai/llm         → 多 LLM provider 统一客户端        │
│    @legalai/search      → BM25 索引 + 混合检索算法          │
├─────────────────────────────────────────────────────────────┤
│  存储层                                                    │
│    PostgreSQL         → 关系数据 + 全文搜索 (legalai 库)   │
│    Redis              → BM25 索引缓存 + 语义检索缓存       │
│    Local FS           → 文件存储（生产可换 S3/R2）         │
└─────────────────────────────────────────────────────────────┘
```

## 关键目录

|目录|用途|
|---|---|
|`packages/core/`|logger / 通用工具 / Zod 共享 schema|
|`packages/config/`|配置加载（Zod 校验）|
|`packages/database/`|pg Pool / migration / query helper|
|`packages/document/`|PDF/DOCX 解析工具|
|`packages/llm/`|多 LLM provider 统一客户端 + 风险检测|
|`packages/search/`|BM25 索引 + 混合检索 + RRF 融合|
|`workers/upload/`|文件上传（multipart + SHA256）|
|`workers/document/`|文档解析（按 mime type 分发）|
|`workers/knowledge/`|混合检索 + Redis 缓存 + trace logging|
|`workers/analysis/`|LLM 分析（risk_review/summarize/qa/clause_compare）|
|`workers/docgen/`|模板填充 + DOCX 导出|
|`workers/pi-user/`|用户面 Agent（ask / chat）|
|`workers/pi-internal/`|内部 Agent（capabilities / execute）|
|`apps/desktop/`|Tauri 桌面壳（React + Vite）|
|`config/`|iii-config.yaml / init.sql / seed.sql / llm-providers.ts|
|`scripts/`|dev.mjs / build.mjs 统一启动与构建|
|`docs/`|架构与决策文档|

## 开发命令

### npm 脚本（根目录）

```bash
pnpm dev          # 一键启动：Docker → engine → 7 workers → Tauri
pnpm build        # 顺序构建：packages → workers → desktop
pnpm test         # Vitest 单元测试
pnpm typecheck    # tsc -b 全项目类型检查
pnpm lint         # biome check
pnpm format       # biome format --write
```

### 细粒度启动

```bash
pnpm dev:db           # 仅启动 Docker (PostgreSQL + Redis)
pnpm dev:engine       # 仅启动 iii engine
pnpm dev:workers      # 仅启动 7 个 workers
pnpm dev:desktop      # 仅启动 Tauri 桌面端
```

### Worker 单独调试

```bash
pnpm --filter @legalai/upload-worker dev
pnpm --filter @legalai/knowledge-worker dev
# ... 其他 worker 同理
```

## 代码规范

### Engine URL 配置（所有 Worker 必须一致）

```typescript
const ENGINE_URL = process.env.III_ENGINE_URL ?? process.env.ENGINE_URL ?? "ws://localhost:49134";
const sdk = registerWorker(ENGINE_URL, { workerName: "xxx-worker" });
```

### 数据库配置（统一凭证）

```typescript
// 通过 @legalai/config 加载
import { loadConfig } from "@legalai/config";
const cfg = loadConfig();

// 等价于：
{
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "legalai",
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "legalai123",
}
```

## 数据库 Schema

| 表 | 用途 | 备注 |
|---|---|---|
| `documents` | 文档元数据 | 含 status: processing/parsed/indexed/error |
| `document_chunks` | 分块 + JSONB embedding | 全文索引 (to_tsvector) |
| `collections` | 知识库集合 | private/shared/public |
| `collection_documents` | 集合-文档关联 | 多对多 |
| `analysis_tasks` | LLM 分析任务 | risk_review/clause_compare/summary/qa |
| `templates` | 17 份文书模板 | seed 数据见 config/seed.sql |
| `generated_documents` | 生成的文书 | markdown/html/docx |
| `audit_logs` | 审计日志 | user_id / action / resource |
| `legal_articles` | **法条库** | 28 条预置（config/seed.sql） |
| `risk_keywords` | **风险关键词** | 25 条预置，high/medium/low |

## 重要文件

### Worker 入口点

|文件|状态|
|---|---|
|`workers/upload/src/index.ts`|✅ 暴露 /api/documents |
|`workers/document/src/index.ts`|✅ 暴露 /api/documents/:id/parse |
|`workers/knowledge/src/index.ts`|✅ 暴露 /api/search + /api/search/reindex |
|`workers/analysis/src/index.ts`|✅ 暴露 /api/analysis/{risk-review,summarize,qa,clause-compare} |
|`workers/docgen/src/index.ts`|✅ 暴露 /api/templates + /api/docgen/{generate,export} |
|`workers/pi-user/src/index.ts`|✅ 暴露 /api/ask + /api/chat |
|`workers/pi-internal/src/index.ts`|✅ 暴露 /api/internal/{execute,capabilities,health} |

### 配置文件

|文件|用途|
|---|---|
|`config/iii-config.yaml`|iii 引擎配置（HTTP/WS/worker paths/logging）|
|`config/init.sql`|PostgreSQL Schema（10 张表）|
|`config/seed.sql`|法条 + 模板 + 风险关键词种子数据|
|`config/llm-providers.ts`|LLM provider 配置（OpenAI/Anthropic/SiliconFlow/Ollama）|
|`.env.example`|环境变量模板|

### 共享包

|包|导出|用途|
|---|---|---|
|`@legalai/core`|`createLogger`、`Logger`、`LLMError`|日志与异常|
|`@legalai/config`|`loadConfig`、`AppConfigSchema`|配置加载与校验|
|`@legalai/database`|`getPool`、`query`、`queryOne`、`withTransaction`|数据库访问|
|`@legalai/document`|`parsePdf`、`parseDocx`、`chunkText`|文档解析|
|`@legalai/llm`|`LLMClient`、`detectRiskKeywords`、`embed`|LLM 调用与风险检测|
|`@legalai/search`|`BM25Index`、`hybridSearch`、`rrfFuse`|混合检索|

## 运行时与工具链

|项目|配置|
|---|---|
|运行时|Node.js >= 20|
|包管理器|pnpm 9.0 (monorepo)|
|Worker 框架|iii-sdk 0.4.x|
|代码检查|Biome|
|测试|Vitest|
|类型检查|TypeScript 5.x (project references)|

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

|操作|目标|
|---|---|
|检索响应|< 500ms|
|文档解析(10页PDF)|< 3s|
|风险分析(标准合同)|< 10s|
|文档生成|< 5s|

## 决策记录

| ID | 决策 | 文档 |
|----|------|------|
| D-001 | 桌面端 Tauri 仅作壳，业务由 iii worker 承担 | REFACTOR.md 阶段 3 |
| D-002 | 桌面端通过 `lib/api.ts` 统一 fetch 调用 worker HTTP API | REFACTOR.md 阶段 4 |
| D-003 | 法条 + 风险关键词在数据库（不在 markdown 文件） | REFACTOR.md 阶段 2.9-2.10 |
| D-004 | 9 个官方 iii worker 集成（iii-observability / cron / queue / storage / shell / mcp / coder / console / iii-lsp）| docs/worker-integration-plan.md |
| D-005 | **不集成** harness（与 pi-internal 职能冲突）| docs/worker-integration-plan.md |
| D-006 | **不集成** database worker（双层抽象，无收益）| docs/worker-integration-plan.md |

## 文档

- `REFACTOR.md` — 阶段 1-7 完整改造计划
- `docs/worker-integration-plan.md` — 22 个官方 worker 集成评估

## 数据库连接

- **Host**: localhost
- **Port**: 5432
- **Database**: legalai
- **User**: postgres
- **Password**: legalai123
