<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Open Ditto (Powered by Kimi)

**Open Ditto** 是一款开源的 AI 智能恋爱社交应用 Demo。此项目演示了基于大模型的：
- 🌟 用户资料与数字分身训练（Agent Training）
- 💬 内置上下文记忆提取（Agentic RAG / Memory Extraction）
- 🤝 多 Agent 自动化协商与安排约会（Agent-to-Agent Negotiation）
- 🛠 未来可扩展的真实 MCP 工具支持（MCP Server Stubs）

本应用的核心 AI 引擎由 **Moonshot AI (Kimi)** 强力驱动。

## 🚀 快速开始

**环境要求：** Node.js 18+

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录下创建一个名为 `.env.local` 的文件，并添加你的 Moonshot API Key：

```env
MOONSHOT_API_KEY="你的_KIMI_API_KEY"
```
*(你可以在 [Moonshot AI 控制台](https://platform.moonshot.cn/console/api-keys) 获取 API Key。)*

### 3. 本地运行

```bash
npm run dev
```

成功启动后，在浏览器访问 `http://localhost:3000` 即可开始你的专属数字分身奇妙旅程！

---

## ☁️ 如何上传到你的 GitHub 仓库

按照以下步骤将这个项目提交到你自己的 GitHub：

### 1. 初始化 Git 仓库并提交代码

在当前项目目录打开终端，依次运行：

```bash
# 初始化 Git 仓库
git init

# 添加所有文件到暂存区
git add .

# 提交第一次更改
git commit -m "Initial commit: Open Ditto powered by Kimi"
```

### 2. 在 GitHub 上创建新仓库
1. 登录你的 Github 账号，点击右上角的 **+** 选择 **New repository**。
2. 填写仓库名称（例如 `open-ditto`），选择 `Public` 或 `Private`，**不要**勾选 "Initialize this repository with a README"（因为本地已经有了）。
3. 点击 **Create repository**。

### 3. 推送代码到 GitHub

复制页面上提示的 `git remote add` 相关的两行代码，在本地终端运行：

```bash
# 将刚刚创建的 GitHub 仓库添加为远程仓库 (注意替换下方的 URL 为你自己的)
git remote add origin https://github.com/你的用户名/open-ditto.git

# 确保主要分支名为 main
git branch -M main

# 推送到 GitHub
git push -u origin main
```

🎉**恭喜！** 你的代码现在已经安全地托管在 GitHub 上了。
