# 官方 iii Worker 集成规划

> **目的**：评估官方 22 个内置/可选 iii Worker 与 `refactor/plan-a-taui-shell` 重构后项目的兼容性，给出集成建议。
>
> **基线**：`refactor/plan-a-taui-shell` 分支已完成的 monorepo 重构（7 个业务 worker + 6 个共享 package）。

---

## 一、当前项目函数/触发器清单

**业务函数（24 个）**

| Worker | Functions |
|---|---|
| `upload-worker` | `upload::create`, `upload::status`, `upload::delete`, `upload::list` |
| `document-worker` | `document::parse`, `document::status` |
| `knowledge-worker` | `knowledge::search`, `knowledge::reindex`, `knowledge::health` |
| `analysis-worker` | `analysis::summarize`, `analysis::risk_review`, `analysis::qa`, `analysis::clause_compare` |
| `docgen-worker` | `docgen::list_templates`, `docgen::get_template`, `docgen::generate`, `docgen::export`, `docgen::create_template` |
| `pi-user` | `pi-user::ask`, `pi-user::chat`, `pi-user::health` |
| `pi-internal` | `pi-internal::execute`, `pi-internal::capabilities`, `pi-internal::health` |

**HTTP 触发器**：`/api/...` 路径共 24+ 个（见 `REFACTOR.md` 3.4 节契约表）。

---

## 二、官方 Worker 评估

### 2.1 引擎内置（无冲突，强烈推荐 ✅）

| Worker | 函数 | 作用 | 集成动作 |
|---|---|---|---|
| `iii-http` | 引擎内置 | HTTP 端点暴露 | 已在用（所有 `/api/...` 通过它） |
| `iii-exec` | 引擎内置 | 启动时执行命令 | 已在用 |
| `iii-observability` | `engine::traces::*`, `engine::metrics::*`, `engine::logs::*` | 分布式追踪/指标/日志 | ✅ 配置启用 `engine.traces.sample_ratio=0.1`（生产 10% 采样） |
| `iii-cron` | `cron::*` | 定时任务 | ✅ 启用，配置 3 个定时任务：清理 30 天前的会话缓存 / 每周重建 BM25 / 每月备份 |
| `iii-queue` | 引擎内置 | 异步任务队列（持久化+重试） | ✅ 启用，替代 document-worker → knowledge-worker 的同步调用 |
| `iii-pubsub` | `pubsub::*` | 发布订阅 | ⚠️ 备选（与 `iii-queue` 有重叠） |
| `iii-state` | `state::*` | KV 状态 | ⚠️ 备选（`@legalai/database` 已有 KV 能力） |
| `iii-stream` | `stream::*` | SSE 流式响应 | ⚠️ 备选（已用 `stream` 包） |

### 2.2 Binary Worker（按场景评估）

| Worker | 评估结论 | 理由 |
|---|---|---|
| `database` | ⚠️ **轻度冲突，暂不集成** | `packages/database/` 已封装 pg pool + migration + query 工具。`database` worker 提供了类似能力但增加一层抽象。可在多节点/读写分离需求出现时再切换。 |
| `storage` | ✅ **强烈推荐** | 替代 `upload-worker` 的本地 FS 写入。生产环境需要 S3/R2，开发环境用 `provider: local` 保持兼容。 |
| `shell` | ✅ **推荐** | 给 LLM 提供的"安全命令执行"能力，可让 Agent 执行容器/服务管理命令。配置 `allowlist` 限制可用命令。 |
| `image-resize` | ⚠️ **评估中** | 当前业务无图片缩放需求。合同文档封面/缩略图是潜在场景，等 `docgen` 实际生成封面时再启用。 |
| `mcp` | ✅ **战略价值高** | 把所有业务函数（24 个）暴露为 MCP 工具，让 Claude Desktop、Cursor、Continue 等 Agent 框架直接调用。零代码改动。 |
| `iii-directory` | ⚠️ **备选** | 用于管理 skills/prompts 文件。当前 `skills/` 目录已直接加载，不需要 registry 中转。 |
| `iii-lsp` | ✅ **开发工具** | CLI 工具，给 VS Code 之外的编辑器（Cursor、Neovim）提供 iii 函数补全。 |
| `iii-lsp-vscode` | ✅ **开发工具** | VS Code 扩展，**手动从 Marketplace 安装**（非 engine worker，不在 config.yaml 里）。 |
| `coder` | ✅ **推荐** | 路径隔离的文件编辑器，给 Agent "读/搜/改/写" 项目内文件的能力。比 `shell` 更结构化、更安全。 |
| `harness` | ❌ **冲突，不推荐** | 内含 `turn-orchestrator` / `session` / `approval-gate` / `provider-*` 等 11 个子 worker。**与 `pi-internal` 的能力发现 + 任务规划/执行功能重叠**。集成后会形成两套并行编排系统。 |
| `console` | ✅ **强烈推荐** | iii 自带 Web UI（`http://localhost:3113`），含 Chat（plan/ask/agent）、Trace 浏览器、函数目录、模型选择器。**比你们手写 React 桌面端的开发效率高 10 倍**。 |
| `configuration` | ⚠️ **备选** | `packages/config/` 已统一管理配置。除非要支持动态配置热加载，否则不必要。 |
| `acp` | ❌ **暂不需要** | Agent 间 JSON-RPC 协议。多 Agent 系统出现时再考虑。 |
| `llm-budget` | ❌ **避免重复** | 已被 `harness` 包含。如果不装 harness 则可单独装。当前你们用 `@legalai/llm` 自行管理 token，无 budget 需求。 |
| `todo-worker` / `todo-worker-python` | ❌ **示例** | 官方示例代码，非生产。 |

### 2.3 关键冲突点详解

#### 冲突 A：`harness` vs `pi-internal`

| 维度 | `harness::turn-orchestrator` | `pi-internal`（你们自实现）|
|---|---|---|
| 任务规划 | LLM 驱动的 FSM | LLM 驱动的 ExecutionPlan |
| 能力发现 | `engine::functions::list` | `pi-internal::capabilities`（cache + 5min TTL）|
| 任务执行 | 注册到 `turn::*` 命名空间 | 注册到 `pi-internal::execute` |
| 当前状态 | 未集成 | ✅ 已集成 + 7 个 worker 全部接入 |

**结论**：集成 `harness` 会导致 `pi-internal::*` 与 `turn::*` 并存，调用方需要二选一。**保持现状**。

#### 冲突 B：`iii-state` vs `@legalai/database`

| 维度 | `iii-state` | `@legalai/database` |
|---|---|---|
| KV 能力 | `state::set/get/del` | `query('INSERT ...')` + Redis |
| 响应式触发器 | ✅ 状态变更触发函数 | ❌ 无 |
| SQL 查询 | ❌ 无 | ✅ 完整 SQL |
| 事务 | ❌ 无 | ✅ `withTransaction` |

**结论**：`iii-state` 适合轻量场景（feature flag、临时缓存），`@legalai/database` 适合关系数据。**两者互补不冲突**。是否切换 `iii-state` 取决于是否需要"响应式触发器"能力。

#### 冲突 C：`database` worker vs `@legalai/database`

| 维度 | `database` worker | `@legalai/database` |
|---|---|---|
| 部署形式 | 独立二进制进程 | 共享 TypeScript 包 |
| 函数调用 | `database::query` / `database::execute` | 直接 `query()` 函数 |
| 进程隔离 | ✅ 独立进程崩溃不影响业务 | ❌ worker 进程崩溃即 DB 访问失败 |
| 性能 | 跨进程调用（JSON 序列化） | 直接函数调用（零开销） |
| 类型安全 | JSON Schema 校验 | Zod + TypeScript 全栈 |

**结论**：`database` worker 是**重量级替代方案**，适合需要独立扩容/灰度的场景。**当前 `packages/database` 满足需求，暂不切换**。

---

## 三、推荐集成方案

### Phase A：立即集成（零代码改动，纯配置）

```yaml
# config/iii-config.yaml  新增
workers:
  auto_discover: true
  paths:
    - ./workers/upload
    - ./workers/document
    - ./workers/knowledge
    - ./workers/analysis
    - ./workers/docgen
    - ./workers/pi-user
    - ./workers/pi-internal

# Engine 内置配置
engine:
  observability:
    enabled: true
    sampling_ratio: 0.1                    # 生产 10% 采样
    exporter: memory                       # 内存导出（开发）

  queue:
    type: builtin                          # 单实例够用
    named_queues:
      document-parse: { concurrency: 5, max_retries: 3 }
      analysis:         { concurrency: 3, max_retries: 3 }
      docgen:           { concurrency: 2, max_retries: 2 }

  cron:
    jobs:
      - name: cleanup-stale-cache
        schedule: "0 2 * * *"
        action: redis::cleanup_pattern(pattern="knowledge:cache:*:old")
      - name: weekly-bm25-reindex
        schedule: "0 0 * * 0"
        action: knowledge::reindex(force=true)
      - name: monthly-backup
        schedule: "0 3 1 * *"
        action: shell::exec(command="pg_dump ...")

# Binary Workers
binary_workers:
  - name: console
    config: { http_port: 3113 }            # Web UI

  - name: mcp
    config:
      api_path: /mcp
      expose: [upload::*, document::*, knowledge::*, analysis::*, docgen::*, pi-user::*]

  - name: storage
    config:
      provider: local                       # 开发
      # provider: s3                      # 生产切换
      # s3: { bucket: legal-ai-docs, region: us-east-1 }

  - name: shell
    config:
      allowlist: [ls, cat, grep, jq, curl, ps, df, du, pwd, whoami]
      denylist: ["rm -rf", "mkfs", "dd if=", "shutdown"]
      max_output_bytes: 1048576

  - name: coder
    config:
      base_path: ./
      non_accessible_globs: ["**/.env*", "**/*.pem", "**/secrets/**", "**/node_modules/**"]
      max_read_bytes: 10485760
      max_write_bytes: 10485760
```

**预估工作量**：0.5 天（仅配置 + 验证）

### Phase B：代码层集成（中等改动）

1. **`upload-worker` 改用 `storage::putObject`**
   - 删除 `fs.writeFile` 调用
   - 改为 `sdk.trigger('storage::put', { bucket: 'documents', key: id, body: buf })`
   - 保留本地路径作为回退

2. **`document-worker` 改用 `iii-queue`**
   - `upload-worker::create` 不再直接调用 `document-worker::parse`
   - 改为 `sdk.trigger('queue::enqueue', { queue: 'document-parse', payload: { documentId } })`
   - `document-worker` 注册一个 `queue::on_message` 触发器消费

3. **启用 `mcp` worker 暴露业务函数**
   - 添加 `mcp` worker 到 `config.yaml`
   - 验证 `/mcp` 端点可用
   - 在 Claude Desktop / Cursor 测试连接

**预估工作量**：2-3 天（含测试）

### Phase C：暂不集成

| Worker | 不集成理由 |
|---|---|
| `harness` | 与 `pi-internal` 职能冲突，集成需先重构 `pi-internal` |
| `database` | 双层抽象，无明显收益 |
| `iii-state` | `@legalai/database` 已覆盖 KV 场景 |
| `iii-pubsub` | `iii-queue` 已覆盖异步场景 |
| `iii-stream` | 已用 `stream` 包做 SSE |
| `acp` | 多 Agent 系统未启动 |
| `llm-budget` | 不装 harness 就单独装也无意义 |
| `configuration` | `packages/config/` 已统一 |
| `image-resize` | 当前无图片处理业务 |
| `iii-directory` | skills/ 已直接加载 |

---

## 四、风险与决策记录

| ID | 风险 | 决策 |
|----|------|------|
| WI-1 | `mcp` worker 暴露 24 个函数给 Claude Desktop，权限过大 | `mcp.config.expose` 显式列出允许的命名空间 |
| WI-2 | `storage` worker 在 `local` 模式下数据目录与 `data/uploads` 不一致 | 迁移期保留两套（旧的 `data/uploads` + `data/storage/documents/`），新上传走 storage |
| WI-3 | `iii-queue` 替代同步调用后，`document.uploaded` 事件链路变化 | 保留事件触发作为回退机制 |
| WI-4 | `coder` worker 路径隔离，Agent 写不到项目根目录 | 配置 `base_path: ./` 即可覆盖整个 monorepo |
| WI-5 | `harness` 不集成 → 失去官方 turn FSM / session 树 | 评估 `pi-internal` 是否需要这些能力，必要时单独引入 |

---

## 五、上线验收清单

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 通过
- [ ] `iii engine start` 启动 console 在 `http://localhost:3113` 可访问
- [ ] Claude Desktop 通过 `/mcp` 端点能调用 `knowledge::search`
- [ ] `upload-worker::create` 后 `document-worker` 自动消费 `document-parse` 队列
- [ ] `coder` worker 在路径 jail 测试中无法逃逸到 `base_path` 之外
- [ ] `iii-cron` 定时任务在指定时间触发并执行成功
