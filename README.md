# 轻卡小记（Dify AI 营养师）

一个可上线的饮食记录系统，包含：
- Dify 工作流 DSL（饮食识别 + 热量计算 + TDEE 对比）
- 小红书风格网页前端
- 后端代理（隐藏 API Key）
- iOS SwiftUI 工程骨架

## 目录结构
- `dify_workflow/`：Dify DSL 与代码节点
- `web_app/`：前端网页（支持时间线、周统计图、体重趋势、连续打卡、PWA）
- `proxy_server/`：后端代理（Node.js + Express）
- `ios_app/`：iOS 应用工程

## 本地运行
### 1. 启动代理
```bash
cd proxy_server
npm install
npm start
```

### 2. 打开网页
- 默认由代理托管：`http://localhost:8787`
- 或单独启动静态服务：
```bash
cd web_app
python -m http.server 8080
```

## 上线方案（推荐）
### 前端：GitHub Pages
- 使用仓库内 `.github/workflows/deploy-pages.yml` 自动部署 `web_app/`。

### 后端：Render / Railway / 云服务器
- 部署 `proxy_server/`
- 配置环境变量：
  - `DIFY_BASE_URL`
  - `DIFY_API_KEY`
  - `CORS_ORIGIN`（设为前端域名）

前端上线后，把页面中的 `Proxy URL` 改为线上代理地址，例如：
- `https://your-proxy.onrender.com`

## 安全
- 不要把真实 API Key 提交到 GitHub。
- `proxy_server/.env` 已在 `.gitignore` 中排除。
