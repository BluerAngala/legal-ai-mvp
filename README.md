# LegalAI - 法律AI知识库MVP

基于 iii + pi 构建的法律服务AI工具，专注**快**和**准**。

## 核心功能

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
│    PostgreSQL         → 关系数据 + 全文搜索          │
│    Redis              → 缓存                        │
└─────────────────────────────────────────────────────┘
```

## 快速启动 (Windows)

### 方式1: 一键启动 (推荐)

```bash
# 双击或运行
start-local.bat
```

### 方式2: Docker (需要 Docker Desktop)

```bash
cd docker
docker compose up -d
```

### 方式3: 手动启动

```bash
# 1. 安装依赖 (Scoop)
scoop install postgresql redis

# 2. 启动服务
pg_ctl start -D ~/scoop/apps/postgresql/18.4/data
redis-server

# 3. 设置数据库
setup-db.bat

# 4. 设置环境变量
set DATABASE_URL=postgresql://postgres:legalai123@localhost:5432/legalai
set REDIS_URL=redis://localhost:6379
set CLAUDE_API_KEY=your_claude_api_key
set OPENAI_API_KEY=your_openai_api_key

# 5. 安装 workers
cd workers/upload && npm install
cd ../document && npm install
cd ../knowledge && npm install
cd ../analysis && npm install
cd ../docgen && npm install

# 6. 启动 iii 引擎
iii --use-default-config
```

## 服务状态检查

```bash
# PostgreSQL
psql -U postgres -d legalai -c "SELECT 1;"

# Redis
redis-cli ping
# 应该返回 PONG
```

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/documents/upload` | 上传文档 |
| GET | `/api/documents/:id` | 获取文档 |
| DELETE | `/api/documents/:id` | 删除文档 |
| POST | `/api/knowledge/search` | 知识检索 |
| POST | `/api/analysis/summarize` | 摘要生成 |
| POST | `/api/analysis/risk-review` | 风险审查 |
| POST | `/api/analysis/qa` | 问答 |
| POST | `/api/docgen/generate` | 文档生成 |
| GET | `/api/templates` | 获取模板列表 |

## 性能目标

| 操作 | 目标 |
|------|------|
| 检索响应 | < 500ms |
| 文档解析(10页PDF) | < 3s |
| 风险分析(标准合同) | < 10s |
| 文档生成 | < 5s |

## 技术栈

- **后端运行时**: iii engine
- **SDK**: iii-sdk (Node.js)
- **数据库**: PostgreSQL 15+ (全文搜索替代 pgvector)
- **缓存**: Redis
- **LLM**: Claude 3.5 Sonnet
- **Embedding**: text-embedding-3-small
- **文档解析**: pdf-parse, mammoth

## 目录结构

```
legal-ai-mvp/
├── start-local.bat      # Windows 一键启动脚本
├── setup-db.bat         # 数据库初始化脚本
├── workers/
│   ├── upload/          # 上传 worker
│   ├── document/        # 文档处理 worker
│   ├── knowledge/       # 知识库 worker
│   ├── analysis/        # 分析 worker
│   └── docgen/         # 文档生成 worker
├── skills/
│   ├── legal-knowledge.md   # 知识库 skill
│   ├── legal-analysis.md    # 分析 skill
│   └── legal-docgen.md      # 生成 skill
├── config/
│   ├── iii-config.yaml     # iii 配置文件
│   └── init.sql            # 数据库 schema
├── docker/
│   └── docker-compose.yml  # Docker 部署
└── package.json
```

## 数据库连接

- **Host**: localhost
- **Port**: 5432
- **Database**: legalai
- **User**: postgres
- **Password**: legalai123

环境变量: `DATABASE_URL=postgresql://postgres:legalai123@localhost:5432/legalai`

## 开发指南

### 添加新 Worker

```bash
cd workers
mkdir my-worker
cd my-worker
npm init -y
pnpm add iii-sdk
```

### 测试 Worker

```bash
iii console
# 在 console 中查看注册的函数
```

### 调试

```bash
# 查看 worker 日志
iii logs

# 查看特定 worker
iii logs --worker my-worker
```
