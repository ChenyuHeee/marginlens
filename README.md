<div align="center">

# 🔍 MarginLens

**AI 辅助学术阅读与批注工具**

在浏览器中阅读论文与笔记，划线提问，AI 智能批注，云端同步，构建你的知识库。

[![Deploy](https://github.com/ChenyuHeee/marginlens/actions/workflows/deploy.yml/badge.svg)](https://github.com/ChenyuHeee/marginlens/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[**在线体验 →**](https://chenyuheee.github.io/marginlens/)

</div>

---

## ✨ 特性

### 阅读与批注
- **📄 多格式支持** — Markdown（GFM、KaTeX 数学公式、代码高亮）与 PDF 双模式阅读
- **🖊️ 划线批注** — 选中任意文本，一键添加笔记或向 AI 提问，批注嵌入正文段落后
- **📌 内联批注卡片** — 可展开、折叠、追问，支持固定到边栏
- **🔗 arXiv 导入** — 粘贴 arXiv 链接即可直接导入 PDF

### AI 能力
- **🤖 多 Provider** — 支持 OpenAI / DeepSeek / Qwen / Ollama 等任意兼容接口，流式输出
- **💬 多轮对话** — 基于全文上下文的 AI 对话，支持多会话管理
- **🌐 AI 翻译** — 选中文本一键翻译，支持 LaTeX 公式渲染
- **📊 API 用量监控** — 按日统计各 Provider 的 Token 消耗，柱状图可视化
- **🔁 LLM 智能修复** — 生成失败时自动将错误信息反馈给 LLM 进行修复，避免无效重试消耗 Token

### 互动教学网页
- **📽️ 一键生成教学 PPT 网页** — 基于文档内容 AI 生成结构化互动演示文稿，支持多种模块：标题页、知识点、公式、定义卡、问答、测验、总结
- **🎬 逐步揭示动画** — 关键点与总结模块支持 `reveal: one-by-one`，点击时逐条展示，避免信息一次呈现
- **⚡ 并行流式生成** — 多幻灯片分批并行生成，实时流式显示进度日志
- **🔗 一键分享** — 将教学网页内容序列化后复制到剪贴板，他人粘贴即可直接打开

### PPT 导出
- **💾 下载为 PPTX** — 将互动教学网页导出为暗色主题的 PowerPoint 文件
- **🔢 LaTeX 公式渲染** — 自动剥离公式包装符（`$$`、`\[...\]`、`\begin{equation}` 等），通过 matplotlib mathtext（Computer Modern 字体）渲染为图片嵌入幻灯片
- **🖱️ 点击触发动画** — 关键点与总结幻灯片支持 Appear 入场动画，每次点击显示下一条目
- **☁️ 云端异步生成** — 导出任务写入 Supabase，由 GitHub Actions Worker 后台生成，前端轮询下载，页面刷新后恢复任务状态

### 文档管理
- **📂 文档排序、置顶、重命名** — 侧栏支持按时间/名称/类型排序，一键固定重要文档
- **🔤 GitHub 推送** — 将 Markdown 笔记推送到 GitHub 仓库，支持自定义 Frontmatter 字段

### 存储与同步
- **💾 本地持久化** — 基于 IndexedDB，数据完全存储在浏览器中，无需后端
- **☁️ 云备份（可选）** — 登录账号后可将文档、批注、对话、API 用量同步到 Supabase 云端
- **🔒 隐私安全** — API Key 仅存本地，云同步前自动移除密钥

---

## 🚀 快速开始

### 在线使用

访问 [https://chenyuheee.github.io/marginlens/](https://chenyuheee.github.io/marginlens/)，无需安装。

### 本地运行

```bash
git clone https://github.com/ChenyuHeee/marginlens.git
cd marginlens
npm install
npm run dev
```

打开 `http://localhost:5173` 即可使用。

### 配置 LLM

1. 点击右下角 ⚙️ **设置** → **API 配置**
2. 选择或新增 Provider（填入 Base URL、API Key、模型名）
3. 选中文档中任意文本，开始提问或批注

### 云备份（可选）

需要自行搭建 Supabase 项目：

1. 在 [supabase.com](https://supabase.com) 创建项目，在 SQL Editor 中执行 `supabase-schema.sql`
2. 在 GitHub Repository Secrets 中添加 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`
3. 重新部署后，侧栏底部出现「登录以开启云备份」入口

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript + Vite 8 |
| 样式 | Tailwind CSS v4 |
| 状态管理 | Zustand |
| 持久化 | IndexedDB (idb) |
| 云同步 | Supabase (可选) |
| Markdown | react-markdown + remark-gfm + remark-math |
| 数学公式 | KaTeX |
| 图标 | Lucide React |
| LLM | OpenAI-compatible Streaming API |
| PPT 生成 | python-pptx + matplotlib mathtext + lxml |
| PPT 导出调度 | GitHub Actions (workflow_dispatch + cron) + Supabase Edge Functions |

## 📁 项目结构

```
src/
├── components/
│   ├── MarkdownViewer.tsx    # Markdown 渲染 + 高亮 + Portal 批注
│   ├── PdfViewer.tsx         # PDF 渲染（pdfjs-dist）
│   ├── InlineAnnotation.tsx  # 内联批注卡片
│   ├── SelectionPopup.tsx    # 选中文本弹窗
│   ├── ChatPanel.tsx         # AI 对话面板
│   ├── TranslatePanel.tsx    # AI 翻译面板
│   ├── ApiMonitorPanel.tsx   # API 用量统计面板
│   ├── Sidebar.tsx           # 文档列表侧栏
│   ├── SettingsDialog.tsx    # 设置（Provider / 模板 / 显示 / GitHub）
│   ├── SyncDialog.tsx        # GitHub 推送对话框
│   ├── AuthDialog.tsx        # 登录 / 注册
│   └── TeachingView.tsx      # 互动教学网页展示 + PPT 导出入口
├── lib/
│   ├── llm.ts                # LLM 流式调用 + Token 用量回调
│   ├── db.ts                 # IndexedDB 操作（含 API 用量）
│   ├── cloudSync.ts          # Supabase 双向同步
│   ├── github.ts             # GitHub Contents API
│   ├── defaults.ts           # 默认配置
│   ├── teachingPpt.ts        # PPT 导出任务创建 / 轮询 / 本地持久化
│   └── teaching/
│       ├── pipeline.ts       # 教学网页并行流式生成 + LLM 修复兜底
│       └── slides/
│           └── generate_ppt.py  # Python Worker：从 JSON 生成暗色 PPTX
├── stores/index.ts           # Zustand 全局状态
└── types/index.ts            # TypeScript 类型定义

supabase/
└── functions/
    └── trigger-ppt-workflow/ # Edge Function：鉴权后触发 GitHub Actions

.github/workflows/
└── generate_ppt.yml          # PPT 生成 Worker（workflow_dispatch + cron 3分钟）
```

## 📄 License

[MIT](LICENSE)

---

<div align="center">
  <sub>Built with ❤️ for academic readers</sub>
</div>

