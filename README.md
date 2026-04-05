# 轻卡小记（Dify AI 营养师）

一个可上线的饮食记录系统，包含：
- Dify 工作流 DSL（饮食识别 + 热量计算 + TDEE 对比）
- 小红书风格网页前端
- 后端代理（隐藏 API Key + 账号体系 + 云端同步）
- iOS SwiftUI 工程骨架

## 目录结构
- `dify_workflow/`：Dify DSL 与代码节点
- `web_app/`：前端网页（支持邮箱验证码登录、时间线、周统计图、体重趋势、连续打卡、PWA）
- `proxy_server/`：后端代理（Node.js + Express，支持邮箱验证码登录）
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
- 已提供 `render.yaml`，可直接在 Render 里导入仓库自动创建服务
- 配置环境变量：
  - `DIFY_BASE_URL`
  - `DIFY_API_KEY`
  - `JWT_SECRET`
  - `EMAIL_PROVIDER`（测试 `mock`，免费生产建议 `smtp`）
  - `CORS_ORIGIN`（设为前端域名）

#### Render 固定域名部署（稳定版）
1. Render 新建 `Blueprint`，选择本仓库（会读取 `render.yaml`）。
2. 在 Render 环境变量里填写：
   - `DIFY_BASE_URL`：你的 Dify 公网地址（例如 `https://api.dify.ai/v1` 或你自建 Dify 域名）。
   - `DIFY_API_KEY`：与上面 Base URL 对应的有效应用 Key。
   - `JWT_SECRET`：一串长随机字符串。
   - `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`。
3. 部署成功后，确认 `GET /api/health` 返回 `ok:true`。
4. 前端固定访问：`https://ahe973993-blip.github.io/light-calorie-pwa/`（不再依赖临时隧道）。

注意：
- `app-ld...` 这种 Key 若只对 `http://localhost/v1` 有效，不能直接用于 Render 生产（Render 无法访问你本机 localhost）。
- 必须使用“公网可访问 Dify”对应的 Key。

## 安全
- 不要把真实 API Key 提交到 GitHub。
- `proxy_server/.env` 已在 `.gitignore` 中排除。
