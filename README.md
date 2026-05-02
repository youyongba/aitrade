# DeepSeek API 行情分析系统

这是一个基于 Node.js 和 Express.js 构建的后端行情分析系统。该系统接收包含交易信号与指标快照的 JSON 数据（支持脏数据清洗），统一使用东八区时间（UTC+8）将其持久化至 SQLite 数据库，并异步调用 DeepSeek API 生成结构化的 AI 行情分析报告。此外，项目自带一个基于 Vue 3 + Tailwind CSS 的现代化前端面板用于交互与展示。

## 🌟 核心功能

- **脏数据提取与清洗**：能够从来源不一、格式复杂的 JSON 结构中（无论层级多深），通过递归提取和别名映射，准确抓取数十种核心指标，并自动容错（默认赋 `null`）。
- **完整性校验**：自动校验核心信号字段（`symbol`、`direction`），确保入库数据的完整性。
- **本地化时间存储**：针对业务场景需求，系统在持久化 SQLite 时，所有时间戳强制使用东八区时间（UTC+8）并存储为 ISO 8601 格式。
- **异步 AI 智能分析**：不阻塞主流程，在数据落库后异步调用 `deepseek-chat` 模型生成详尽的 Markdown 分析报告，涵盖多空总览、流动性风险、指标共振和综合建议等。
- **现代化控制面板**：内嵌可视化前端（信号大厅、详情解读、测试沙盒），提供开箱即用的完整体验。
- **自动 API 文档**：集成了 Swagger UI，便于开发者进行 API 调试与对接。

## 🛠 技术栈

### 后端
- **运行环境**: Node.js (纯 JavaScript, ES Module 规范)
- **Web 框架**: Express.js
- **数据库**: better-sqlite3 (同步操作，性能优异，适合单机使用)
- **AI 接口**: openai (官方 npm 包调用 DeepSeek 兼容接口)
- **文档与工具**: swagger-jsdoc, swagger-ui-express, dotenv, nodemon

### 前端
- **核心框架**: Vue 3 (CDN 引入)
- **UI 样式**: Tailwind CSS (CDN 引入，包含 Typography 插件)
- **Markdown 渲染**: Marked.js

## 📂 项目结构

```text
project/
  ├── package.json
  ├── .env.example               # 环境变量参考
  ├── app.js                     # 服务入口与静态文件、Swagger挂载
  ├── config.js                  # 统一配置与环境变量读取
  ├── db.js                      # 数据库初始化、SQLite CRUD 及东八区时间处理
  ├── extractor.js               # 脏数据清洗与字段提取逻辑
  ├── public/
  │   └── index.html             # 可视化前端面板
  ├── routes/
  │   └── signals.js             # 信号相关的 RESTful 路由
  ├── services/
  │   └── analysis.js            # DeepSeek AI 分析调用服务
  └── data/                      # 自动创建，用于存放 signals.db 数据库文件
```

## 🚀 快速开始

### 1. 安装依赖

请确保您的 Node.js 版本 ≥ 18。

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 文件并重命名为 `.env`，填入您的 DeepSeek API Key：

```bash
cp .env.example .env
```

编辑 `.env` 文件：
```ini
PORT=3000
DEEPSEEK_API_KEY=您的DeepSeek_API_密钥
DATABASE_PATH=./data/signals.db
```

### 3. 启动服务

- **开发模式**（支持代码热重载）：
  ```bash
  npm run dev
  ```
- **生产模式**：
  ```bash
  npm start
  ```

服务启动后，控制台会输出相关提示：
- 前端面板访问地址: `http://localhost:3000`
- Swagger API 文档地址: `http://localhost:3000/api-docs`

首次运行系统会自动创建 `data/` 目录和相应的 SQLite 数据库表。

## 🔗 API 接口一览

- `POST /api/v1/signals`：接收未规范的交易信号 JSON，执行清洗入库并触发异步 AI 分析。
- `GET /api/v1/signals`：分页查询信号列表及最新 AI 报告摘要。
- `GET /api/v1/signals/:id`：获取单条信号的完整数据及其所有关联的分析报告。
- `POST /api/v1/signals/:id/analyze`：针对指定信号手动触发重新分析。

## 💡 前端面板说明

浏览器打开 `http://localhost:3000` 即可进入系统：
1. **信号大厅**：列表化展示历史接收到的信号及风险评分，并支持查阅 AI 分析的简短摘要。
2. **查看详情**：点击大厅中的“查看详情”即可左右分屏浏览。左侧为结构化好的核心指标与预警，右侧为格式化精美的 DeepSeek 深度分析报告。右上角支持点击按钮“重新分析”。
3. **发送测试信号**：面板右上角提供了测试入口，自带包含深层嵌套的脏数据 JSON 模板，可一键发送并体验整个数据清洗与 AI 解析流程。

## 📄 许可证

ISC
