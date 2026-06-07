# 改造开发文档（Plan A）

> **项目**：legal-ai-mvp  
> **方案**：方案 A — 激进重写（Tauri 退化为壳，iii 集团独大）  
> **维护原则**：本文档与代码同步更新；每完成一项打勾 ✅，未完成打 ⬜。

---

## 一、改造目标

### 1.1 核心问题
- Tauri 后端（Rust）重复实现了大量业务逻辑（ai_engine / database / legal_knowledge / search），与 iii 集团的能力重叠。
- 配置、API Key、模型名、连接串散落在多个文件，存在硬编码。
- iii 集团未真正发挥作用：worker 数量充足但很多能力未连入桌面端。
- 包管理混乱：根级、worker 级、apps 级各有依赖，跨平台启动脚本（`start.sh`）不通用。

### 1.2 改造后形态
```
┌────────────────────────────────────────────────────┐
│  Desktop (Tauri)  ──壳──  只剩 proxy.rs + 窗口     │
│         │  HTTP/WebSocket                           │
│         ▼                                           │
│  iii 引擎 (HTTP :3111 / WS :49134)                  │
│         │                                           │
│    pi-user ──理解需求──▶ pi-internal ──调度──▶ 集团 │
│                                            │       │
│             ┌──── upload ────┐              │       │
│             │ document       │              │       │
│             │ knowledge      │              ▼       │
│             │ analysis ◀─────┘ 共享 packages/*      │
│             │ docgen                              │
│             └────── 全部用 @legalai/* 共享层 ──────┘ │
└────────────────────────────────────────────────────┘
```

### 1.3 关键目标（验收标准）
| # | 目标 | 度量 |
|---|------|------|
| G1 | 零硬编码配置 | 仓库内无明文 API Key / 默认模型名 / 默认连接串 |
| G2 | 单一配置入口 | 所有 worker 走 `loadConfig()` + Zod 校验，缺关键 env 即 fail-fast |
| G3 | 共享层去重 | BM25、LLM 客户端、DB 客户端、配置、日志只存在 packages/* 一份 |
| G4 | Tauri 瘦身为壳 | Rust 侧只剩 `proxy.rs` + 窗口；删除 `ai_engine/legal_knowledge/search/database.rs` |
| G5 | 桌面端走真 API | 5 个 Page 全部从 iii 集团 HTTP 拉数据，删除 `simulateTrace` 造假动画 |
| G6 | 启动入口统一 | 根 `package.json` 一条 `pnpm dev` 起所有 |
| G7 | 质量门禁 | `biome check` + `vitest run` + `cargo build` 全部通过 |

---

## 二、阶段拆分与进度

> 进度：✅ 已完成  ⏳ 进行中  ⬜ 未开始

### 阶段 1：Monorepo 重构 — packages/* 共享层

| 步骤 | 内容 | 状态 | 说明 |
|------|------|------|------|
| 1.1 | `pnpm-workspace.yaml` 收敛 packages/workers/apps | ✅ | 已有 |
| 1.2 | `@legalai/config` — Zod 校验 + loadConfig() | ✅ | packages/config/src/index.ts |
| 1.3 | `@legalai/core` — Logger + 错误类型 | ✅ | packages/core/src/index.ts |
| 1.4 | `@legalai/llm` — 多 Provider 统一客户端 | ✅ | packages/llm/src/index.ts |
| 1.5 | `@legalai/database` — Postgres 连接池 | ✅ | packages/database/src/index.ts |
| 1.6 | `@legalai/search` — BM25 + 语义 + RRF | ✅ | packages/search/src/index.ts |
| 1.7 | `@legalai/document` — 解析 + chunking | ✅ | packages/document/src/index.ts |
| 1.8 | packages/* 单元测试 | ✅ | vitest 通过 |

### 阶段 2：Workers 全面接入 packages/*

| 步骤 | 内容 | 状态 | 说明 |
|------|------|------|------|
| 2.1 | `upload-worker` 改用 @legalai/config + database | ✅ | workers/upload/src/index.ts |
| 2.2 | `document-worker` 改用 @legalai/config + document + llm | ✅ | workers/document/src/index.ts |
| 2.3 | `knowledge-worker` 改用 @legalai/config + search + llm + database | ✅ | workers/knowledge/src/index.ts |
| 2.4 | `analysis-worker` 改用 @legalai/config + llm | ✅ | workers/analysis/src/index.ts |
| 2.5 | `docgen-worker` 改用 @legalai/config + database | ✅ | workers/docgen/src/index.ts |
| 2.6 | `pi-user` 改用 @legalai/config + llm | ✅ | **本轮完成** — workers/pi-user/src/index.ts |
| 2.7 | `pi-internal` 改用 @legalai/config + llm | ✅ | **本轮完成** — workers/pi-internal/src/index.ts |
| 2.8 | 7 个 worker 全部加 HTTP Trigger（`/api/...`） | ✅ | 全部已有 |
| 2.9 | 数据库 `init.sql` 增 `legal_articles` / `risk_keywords` 表 | ✅ | config/init.sql + config/seed.sql |
| 2.10 | seed 28 条法条 + 17 份模板 + 风险关键词 | ✅ | config/seed.sql |
| 2.11 | `config/iii-config.yaml` 增 `pi-user` / `pi-internal` 路径 | ✅ | 显式列出全部 7 个 worker |

| 步骤 | 内容 | 状态 | 说明 |
|------|------|------|------|
| 3.1 | 删除 `ai_engine.rs` | ⬜ | src-tauri/src/ai_engine.rs（与 pi-user 重复） |
| 3.2 | 删除 `legal_knowledge.rs` | ⬜ | 内置 28 条法条改走 knowledge-worker |
| 3.3 | 删除 `search.rs` | ⬜ | 改走 knowledge-worker 的 BM25 |
| 3.4 | 删除 `database.rs` | ⬜ | 改走 iii HTTP |
| 3.5 | 删除 11 个 `#[tauri::command]` | ⬜ | 在 lib.rs / main.rs 中裁剪 |
| 3.6 | 新增 `proxy.rs` — 仅做 HTTP/WebSocket 转发 | ⬜ | 桌面 → iii 集团 |
| 3.7 | 简化 `Cargo.toml` — 移除 rusqlite / reqwest 等 | ⬜ | 减体积 16MB → 目标 < 5MB |
| 3.8 | 删除 `src-tauri/legal_answers/` 静态资源 | ⬜ | 模板改由 docgen-worker 渲染 |
| 3.9 | `cargo build --release` 通过 | ⬜ | 验证 |

### 阶段 4：桌面端 React 接入真 API

| 步骤 | 内容 | 状态 | 说明 |
|------|------|------|------|
| 4.1 | 新增 `src/lib/api.ts` — 统一封装 iii HTTP | ⬜ | 含 fetch / 流式 / Trace 上报 |
| 4.2 | `App.tsx` 引入 `react-router-dom`，替换 switch-case | ⬜ | 5 个路由：`/qa` `/documents` `/search` `/analysis` `/templates` |
| 4.3 | `QAPage.tsx` 删除 `simulateTrace` 造假动画 | ⬜ | 改接 `GET /api/ask/health` + `POST /api/ask` 真实流式 trace |
| 4.4 | `DocumentsPage.tsx` 切到 `POST /api/documents/upload` | ⬜ | |
| 4.5 | `SearchPage.tsx` 切到 `POST /api/search` | ⬜ | |
| 4.6 | `AnalysisPage.tsx` 切到 `POST /api/analysis/*` | ⬜ | |
| 4.7 | `TemplatesPage.tsx` 切到 `POST /api/docgen/*` | ⬜ | |
| 4.8 | 根 `biome.json` 格式化配置 + `pnpm lint` 通过 | ⬜ | |

### 阶段 5：启动入口统一

| 步骤 | 内容 | 状态 | 说明 |
|------|------|------|------|
| 5.1 | 删除 `scripts/start.sh` | ⬜ | 旧的 shell 脚本跨平台差 |
| 5.2 | 新建 `scripts/dev.mjs` — Node 跨平台启动器 | ⬜ | docker / engine / workers / desktop 串行拉起 |
| 5.3 | 根 `package.json` 统一 `dev` / `dev:db` / `dev:engine` / `dev:workers` / `dev:desktop` | ⬜ | 已分拆为 5 个子命令；待串成默认 `dev` |
| 5.4 | 修正 `dev:workers` 中 package 名（`@legalai/...` 旧写为 `@legal-ai/...`） | ✅ | 本轮已修 |
| 5.5 | 提供 `pnpm typecheck` 跑通所有 worker | ⏳ | pi-user/pi-internal 待装依赖后 typecheck 验证 |

### 阶段 6：质量门禁

| 步骤 | 内容 | 状态 | 说明 |
|------|------|------|------|
| 6.1 | `pnpm test`（vitest）全绿 | ⏳ | 部分 worker 还未独立 vitest 配置 |
| 6.2 | `pnpm typecheck` 全绿 | ⏳ | 待阶段 2 收尾 |
| 6.3 | `cargo build --release` 通过 | ⬜ | 阶段 3 后 |
| 6.4 | `biome check .` 通过 | ⬜ | 阶段 4.8 后 |

### 阶段 7：收尾

| 步骤 | 内容 | 状态 | 说明 |
|------|------|------|------|
| 7.1 | `.gitignore` 检查（`node_modules` / `dist` / `target` / `.env`） | ⬜ | |
| 7.2 | 最终硬编码审计（grep `sk-` / `localhost:5` / `Pro/MiniMaxAI`） | ⬜ | 阶段 3 后做 |
| 7.3 | README 改版（去掉 SQLite 描述、改写"快速开始"指向真 API） | ⬜ | 阶段 3-4 后 |
| 7.4 | CHANGELOG.md — 写明 0.x → 1.0 重大变更 | ⬜ | |

---

## 三、关键改造方法（做法手册）

### 3.1 Worker 改用 packages/* 标准模板

```typescript
// 1. 入口
import { registerWorker } from 'iii-sdk';
import { loadConfig } from '@legalai/config';
import { createLogger, WorkerError } from '@legalai/core';
import { LLMClient, extractJson } from '@legalai/llm';
import { query, queryOne } from '@legalai/database';

// 2. 加载配置（缺关键 env → fail-fast）
const cfg = loadConfig();
const log = createLogger('xxx-worker');
const llm = new LLMClient(cfg.llm);

// 3. 注册 worker
const sdk = registerWorker(cfg.engine.url, { workerName: cfg.engine.workerName });

// 4. 注册函数（统一命名 worker::action）
sdk.registerFunction('xxx::action', async (input) => { ... });

// 5. 注册 HTTP 触发器（路径走 /api/...）
sdk.registerTrigger({
  type: 'http',
  function_id: 'xxx::action',
  config: { api_path: '/api/xxx/action', http_method: 'POST' },
});
```

### 3.2 禁止出现的硬编码（grep 关键字）

```bash
# 任何提交都不应包含
grep -rE "sk-[a-zA-Z0-9]{20,}"   # 任何 LLM API Key
grep -rE "Pro/MiniMaxAI"          # 任何默认模型
grep -rE "localhost:5[0-9]{3}"    # 任何默认端口
grep -rE "postgres:legalai123"    # 任何默认 DB 密码
grep -rE "process.env.LLM_[A-Z]+ ?\\|\\| ?'" # 任何 process.env + 默认值
```

### 3.3 Tauri 砍业务后保留的最小文件

```
src-tauri/src/
├── main.rs           # 入口（最小）
├── lib.rs            # 注册 proxy command
├── proxy.rs          # 唯一业务：转发到 iii 集团
└── tauri.conf.json   # 窗口配置
```

### 3.4 桌面端调用真 API 的契约

| 路由 | Method | Worker Function | 用途 |
|------|--------|-----------------|------|
| `/api/ask` | POST | `pi-user::ask` | 用户提问 |
| `/api/chat` | POST | `pi-user::chat` | 多轮对话 |
| `/api/ask/health` | GET | `pi-user::health` | 心跳 |
| `/api/documents/upload` | POST | `upload::create` | 上传文件 |
| `/api/documents` | GET | `upload::list` | 列出文档 |
| `/api/documents/:id` | GET | `upload::status` | 文档详情 |
| `/api/documents/:id` | DELETE | `upload::delete` | 删除 |
| `/api/search` | POST | `knowledge::search` | 混合检索 |
| `/api/search/reindex` | POST | `knowledge::reindex` | 重建索引 |
| `/api/analysis/summarize` | POST | `analysis::summarize` | 摘要 |
| `/api/analysis/risk-review` | POST | `analysis::risk_review` | 风险审查 |
| `/api/analysis/qa` | POST | `analysis::qa` | 文档问答 |
| `/api/analysis/clause-compare` | POST | `analysis::clause_compare` | 条款对比 |
| `/api/docgen/*` | POST | `docgen::*` | 文档生成（markdown/html/docx） |
| `/api/internal/execute` | POST | `pi-internal::execute` | 内部调度入口 |
| `/api/internal/capabilities` | GET | `pi-internal::capabilities` | 能力发现 |

---

## 四、风险与决策记录

| ID | 风险 | 决策 | 状态 |
|----|------|------|------|
| R1 | iii-sdk 0.4.x vs 0.16.x API 差异 | 全局统一锁 `^0.4.0`（与已重构的 worker 一致） | ✅ |
| R2 | 删除 `legal_answers/` 后模板无数据 | 阶段 2.10 seed 17 个模板到 `templates` 表 | ⬜ |
| R3 | Tauri Rust 侧的 SQLite 没了，桌面端离线能否工作？ | 桌面端所有功能走 iii HTTP；离线 = 降级提示，不缓存 | ⬜ |
| R4 | `simulateTrace` 删除后首屏没动画 | 真实流式 trace 更有价值，但需要 `streamChannel` 改造 | ⬜ |
| R5 | Cargo.toml 减依赖后是否还能 build | 阶段 3.7 同步 `cargo build` 验证 | ⬜ |

---

## 五、当前冲刺清单（按优先级）

1. **阶段 3.1-3.4**：删除 Tauri 4 个业务文件（一次 PR 完成）  
2. **阶段 3.5-3.8**：Tauri 缩到 5MB 以内  
3. **阶段 4.1-4.7**：桌面端接真 API（最影响体验）  
4. **阶段 2.9-2.11**：init.sql 增表 + seed 数据  
5. **阶段 6-7**：质量门禁 + 收尾

---

> 维护人：直接在对应行内把 ⬜ 改成 ✅ 并写明 commit hash 即可。

---

## 六、Path A：Harness 官方 Worker 集成（✅ 已完成）

> **用户决策**：用官方 harness 替代自定义 pi-internal 编排层  
> **目标**：FSM 驱动的 turn-orchestrator + session 树 + 多 provider 支持

### 6.1 已完成的改造

| 步骤 | 内容 | 状态 |
|------|------|------|
| 6.1.1 | iii engine 正常启动（无 Docker，无 OTel） | ✅ |
| 6.1.2 | harness bundle 本地运行（`node index.mjs`，绕过 Docker sandbox） | ✅ |
| 6.1.3 | OTel fetch wrapper 已 patch（`patchGlobalFetch` no-op） | ✅ |
| 6.1.4 | DEFAULT_API_URL5 → SiliconFlow URL（bundle 内 patch） | ✅ |
| 6.1.5 | `III_ISOLATION=false` / `OTEL_ENABLED=false` 设置 | ✅ |
| 6.1.6 | `OPENAI_API_KEY` env 设为 SiliconFlow key（provider fallback） | ✅ |
| 6.1.7 | `run::start` + `turn::get_state` + `session-tree::messages` 端到端测试通过 | ✅ |
| 6.1.8 | 200 functions 注册成功（含 run/turn/session/provider FSM 全套） | ✅ |

### 6.2 启动方式

```bash
# 1. 设置环境变量（关键！）
export LLM_API_KEY='your-siliconflow-key'
export OPENAI_API_KEY='your-siliconflow-key'
export III_ISOLATION='false'
export OTEL_ENABLED='false'

# 2. 启动 iii engine
iii --config ./config.yaml

# 3. 启动 harness bundle（单独进程，不走 Docker sandbox）
cd /Users/bluer/.iii/workers-bundle/harness
node index.mjs --config ./iii.worker.yaml --url ws://localhost:49134

# 或使用脚本
bash scripts/start-harness.sh   # 只启动 harness
bash scripts/start-all.sh         # 同时启动 engine + harness
```

### 6.3 已验证的 FSM 流程

```
run::start (session_id, provider="openai", model="deepseek-ai/DeepSeek-V3", messages)
    → turn::get_state: state="running"
    → LLM stream via provider::openai::stream (SiliconFlow)
    → turn::get_state: state="stopped", turn_count=1
    → session-tree::messages: [user_msg, assistant_msg]
```

### 6.4 关键修复记录

| 问题 | 原因 | 修复 |
|------|------|------|
| `m.content.filter is not a function` | messages 中 `content` 传了 string 而非 `ContentBlock[]` | 传 `content: [{"type":"text","text":"..."}]` |
| `fetch failed: TypeError` | OTel fetch wrapper 注入了不可识别的 trace headers | bundle 内 patch `patchGlobalFetch` 为 no-op |
| harness Docker sandbox 失败 | `docker.io/iiidev/node` 镜像拉不到 | `III_ISOLATION=false` + bundle 直接 `node index.mjs` |
| Provider "no credential" | `provider-openai` 从 `process.env.OPENAI_API_KEY` 读 key | 设置 `OPENAI_API_KEY=SiliconFlow_key` |
| config.yaml `provider_openai` 报错 | top-level key 不被 engine 接受 | 删 top-level，通过 env 和 bundle 默认值解决 |

### 6.5 下一步

| 步骤 | 内容 | 状态 |
|------|------|------|
| 6.5.1 | pi-user / pi-internal 从 harness FSM 暴露的工具中调用业务 worker（knowledge, analysis, docgen） | ⬜ |
| 6.5.2 | `approval-gate` 配置（允许无需审批的 ask 模式） | ⬜ |
| 6.5.3 | MCP worker 注册业务函数（桌面端走 MCP 调用业务能力） | ⬜ |
| 6.5.4 | 桌面端通过 `run::start` FSM 替代直接 `pi-user::ask` HTTP 调用 | ⬜ |

---

> 维护人：直接在对应行内把 ⬜ 改成 ✅ 并写明 commit hash 即可。
