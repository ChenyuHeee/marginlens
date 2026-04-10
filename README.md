<div align="center">

# 🔍 MarginLens

**AI-Powered Academic Reading & Annotation Tool**

在浏览器中阅读论文笔记，划线提问，智能批注，构建你的知识图谱。

[![Deploy](https://github.com/ChenyuHeee/marginlens/actions/workflows/deploy.yml/badge.svg)](https://github.com/ChenyuHeee/marginlens/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[**在线体验 →**](https://chenyuheee.github.io/marginlens/)

</div>

---

## ✨ 特性

- **📄 Markdown 渲染** — 完整支持 GFM、数学公式 (KaTeX)、代码高亮、表格、锚点导航
- **🖊️ 划线批注** — 选中任意文本，添加笔记或向 AI 提问，批注直接嵌入正文
- **🤖 LLM 集成** — 支持 OpenAI / DeepSeek / Qwen / Ollama 等多种后端，流式输出
- **💬 多轮对话** — 基于全文上下文的 AI 对话，支持多会话管理
- **📌 内联批注** — 批注卡片插入高亮段落后方，可展开、可滚动、可追问
- **🌗 深浅主题** — macOS 风格 UI，支持一键切换 Light / Dark 模式
- **💾 本地持久化** — 基于 IndexedDB，数据完全存储在浏览器中，无需后端
- **🔒 隐私安全** — API Key 仅存本地，所有数据不离开你的浏览器

## 📸 截图

> 打开应用后，导入一篇 Markdown 笔记，选中文字即可开始提问和批注。

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

1. 点击右下角 ⚙️ 设置按钮
2. 选择 LLM 提供商（OpenAI / DeepSeek / Qwen / Ollama）
3. 填入 API Key 和模型名称
4. 开始提问！

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript + Vite |
| 样式 | Tailwind CSS v4 |
| 状态管理 | Zustand |
| 持久化 | IndexedDB (idb) |
| Markdown | react-markdown + remark-gfm + remark-math |
| 数学公式 | KaTeX |
| 代码高亮 | rehype-highlight |
| 图标 | Lucide React |
| LLM | OpenAI-compatible Streaming API |

## 📁 项目结构

```
src/
├── components/          # React 组件
│   ├── MarkdownViewer   # Markdown 渲染 + 高亮 + Portal 批注
│   ├── InlineAnnotation # 内联批注卡片（可展开/追问）
│   ├── SelectionPopup   # 选中文本弹窗（提问/批注）
│   ├── ChatPanel        # AI 对话面板
│   ├── Sidebar          # 文档列表侧栏
│   └── SettingsDialog   # 设置对话框
├── stores/              # Zustand 状态管理
├── lib/
│   ├── llm.ts           # LLM 流式调用
│   ├── context.ts       # 上下文构建（文档 + 批注）
│   ├── db.ts            # IndexedDB 操作
│   └── defaults.ts      # 默认配置/模板
└── types/               # TypeScript 类型定义
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

```bash
# Fork 并克隆项目
npm install
npm run dev

# 提交前检查
npm run lint
npm run build
```

## 📄 License

[MIT](LICENSE)

---

<div align="center">
  <sub>Built with ❤️ for academic readers</sub>
</div>
