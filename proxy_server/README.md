# 后端代理版（账号 + 云端同步）

## 作用
- 前端只请求代理，不暴露 Dify API Key
- 后端统一负责：
  - 邮箱验证码登录
  - 运行 Dify 工作流
  - 按用户保存饮食记录（云端同步）

## 目录
- `proxy_server/`：后端服务
- `web_app/`：前端页面

## 1) 配置环境变量
```bash
cd proxy_server
cp .env.example .env
```

关键变量：
- `DIFY_BASE_URL=https://api.dify.ai/v1`
- `DIFY_API_KEY=你的Dify应用API_KEY`
- `JWT_SECRET=长随机字符串`
- `EMAIL_PROVIDER=mock|smtp|resend`
- `DB_PATH=./data/store.json`

免费测试模式：
- `EMAIL_PROVIDER=mock`
- 可配 `EMAIL_DEBUG_RETURN_CODE=true`，前端会返回测试验证码（仅测试环境）

免费生产模式（SMTP，推荐 QQ/163）：
- `EMAIL_PROVIDER=smtp`
- `SMTP_HOST=smtp.qq.com`（或 `smtp.163.com`）
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER=你的邮箱`
- `SMTP_PASS=SMTP授权码（不是邮箱登录密码）`
- `SMTP_FROM=你的邮箱`

生产邮件（Resend）：
- `EMAIL_PROVIDER=resend`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`（例如 `noreply@你的域名`）

## 2) 安装依赖并启动
```bash
cd proxy_server
npm install
npm start
```

启动后：
- 健康检查：`GET /api/health`
- 前端页面（本地）：`http://localhost:8787`

## 3) 主要 API
### 鉴权
- `POST /api/auth/email/send` 发送邮箱验证码
- `POST /api/auth/email/login` 邮箱验证码登录
- `GET /api/auth/me` 获取当前用户

### 记录
- `POST /api/nutrition/run` 运行工作流并写入当日记录（需 Bearer Token）
- `GET /api/records` 获取当前用户记录（需 Bearer Token）

## 数据存储
- 默认使用 JSON 文件：`DB_PATH` 指定的路径。
- 要“真正云端永久保存”，请部署到有持久磁盘的服务，或改接 MySQL/PostgreSQL。

## 安全建议
- `DIFY_API_KEY`、`JWT_SECRET` 必须只放后端。
- 生产把 `CORS_ORIGIN` 限制为你的前端域名。
- 为登录和提交接口增加限流、防刷。
- 生产必须关闭 `EMAIL_DEBUG_RETURN_CODE`，避免把验证码回传给前端。

## Render 稳定上线（推荐）
1. 在 Render 使用仓库根目录的 `render.yaml` 创建服务。
2. 在 Render 控制台补齐这些环境变量：
   - `DIFY_BASE_URL`
   - `DIFY_API_KEY`
   - `JWT_SECRET`
   - `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`
3. 部署完成后访问：`/api/health`。

重要：
- 如果你的 Dify Key 只在 `http://localhost/v1` 可用，它不能用于 Render。
- Render 只能调用“公网可达”的 Dify 地址。
