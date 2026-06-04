# LegalAI - 法律AI知识库 MVP

基于 **iii + pi** 架构的法律服务 AI 工具，专注**快**和**准**。

## ✨ 核心特性

- 🤖 **双中枢智能调度** - pi-user（用户中枢）+ pi-internal（内部调度）
- ⚖️ **专业法律咨询** - 基于硅基流动 Pro/MiniMaxAI/MiniMax-M2.5
- 📚 **28条真实法条** - 民法典、刑法、劳动法、道交法、民诉法
- 🔍 **SQLite FTS5** - 毫秒级全文检索
- 📝 **文档生成** - 17个文书模板
- 💼 **跨平台桌面** - Tauri v2 (Windows / macOS / Linux)

## 🏗️ 架构

### Monorepo 结构
```
legal-ai-mvp/
├── packages/                    # 共享包
│   ├── database/                # SQLite 操作
│   ├── search/                  # BM25 搜索
│   ├── llm/                     # LLM 客户端
│   ├── document/                # 文档处理
│   └── core/                    # 核心业务
├── apps/
│   └── desktop/                 # Tauri v2 桌面应用
│       ├── src/                 # React 前端
│       │   ├── pages/          # 5个页面（问答/文档/检索/分析/模板）
│       │   ├── App.tsx
│       │   └── styles.css      # 古籍 × 现代极简美学
│       └── src-tauri/          # Rust 后端
│           ├── src/
│           │   ├── ai_engine.rs       # 硅基流动集成
│           │   ├── database.rs        # SQLite + FTS5
│           │   ├── legal_knowledge.rs # 28条法条
│           │   └── search.rs          # 全文检索
│           └── legal_answers/         # 17个文书模板
└── workers/                     # iii 引擎的 workers
    ├── pi-user/                # 用户中枢
    ├── pi-internal/            # 内部调度中枢
    ├── knowledge/              # 知识库
    ├── analysis/               # 风险分析
    ├── document/               # 文档处理
    ├── docgen/                 # 文档生成
    └── upload/                 # 文件上传
```

### 核心设计原则
- **零硬编码任务类型** - AI 动态理解，不预设 search/analyze
- **零硬编码领域** - AI 自动判断领域，不限法律
- **动态 worker 发现** - 通过 iii 引擎自动发现所有能力
- **AI 动态规划** - 每个任务都重新规划执行步骤
- **容错执行** - worker 失败时 LLM 直接处理或跳过

## 🚀 快速开始

### 桌面应用（推荐）

```bash
# 安装依赖
cd apps/desktop
pnpm install

# 开发模式
pnpm tauri dev

# 构建发布
pnpm tauri build
```

### 默认配置

- **LLM API Key**: `sk-crwfmfqcogblddlpymiqqaatuepooklkjdelsxephytdswwe`（硅基流动）
- **Model**: `Pro/MiniMaxAI/MiniMax-M2.5`
- **数据库**: SQLite (自动创建于 `~/Library/Application Support/LegalAI/`)

## 💻 使用

1. 启动应用后默认进入「🤖 问答」页
2. 点击示例问题或输入自己的法律问题
3. 实时观看 worker 集团的工作流转
4. 流式接收专业法律回答（带法条引用）

### 5 个功能页

| 页面 | 功能 |
|------|------|
| 🤖 问答 | AI 智能法律咨询 · 流式回答 · worker 流转可视化 |
| 📄 文档 | 拖拽上传 · 列表管理 · 详情查看 |
| 🔍 检索 | FTS5 全文搜索 · 相关度排序 |
| ⚖️ 分析 | 风险审查 · 摘要生成 · 条款对比 |
| 📝 模板 | 17 个法律文书模板 · 变量填充 |

## 🎨 设计美学

**"古籍 × 现代极简"** 风格：
- 暗色律所背景 + 噪声纹理
- Noto Serif SC 中文字体（宋体风骨）
- 金色（#c9a961）+ 朱红印章（#b8412a）+ 米黄宣纸（#e8dcc4）三色系
- 印章式 LOGO + 金色装饰线条

## 🛠️ 技术栈

### 前端
- React 18 + TypeScript
- Vite 5 (构建)
- marked.js (Markdown 渲染)
- 原生 CSS（无 UI 框架）

### 后端
- Tauri v2 (Rust + WebView)
- rusqlite (SQLite + FTS5)
- reqwest (HTTP 客户端)
- parking_lot (同步原语)
- tokio (异步运行时)

### 引擎
- iii 引擎 (worker 集团)
- 硅基流动 LLM (Pro/MiniMaxAI/MiniMax-M2.5)
- 官方 workers: shell, harness (turn-orchestrator, providers, etc.)

## 📊 性能

| 指标 | 数值 |
|------|------|
| Release 二进制 | 16 MB |
| 前端 bundle | 207 KB JS + 34 KB CSS |
| LLM 响应 | 2-15 秒 |
| SQLite 检索 | 毫秒级 |
| 启动时间 | < 1 秒 |

## 📜 内置法律知识

**28 条核心法条** 覆盖：
- 民法典（合同/婚姻/侵权/继承）
- 刑法（诈骗/故意伤害/盗窃）
- 劳动法（工时/加班/解除）
- 道路交通安全法（事故责任/酒驾）
- 民事诉讼法（起诉条件/诉讼时效）

**17 个文书模板**：合同、律师函、分析报告等

## 🔒 隐私

- 100% 本地运行（除 LLM API 调用）
- SQLite 数据库存储在本地
- 无数据上传到第三方

## 📄 许可证

MIT License

---

> 本项目专注于让律师和普通用户都能快速、准确地获得专业法律意见。
