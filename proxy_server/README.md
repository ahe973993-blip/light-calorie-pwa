# 后端代理版（账号密码 + 云端同步）

## 作用
- 前端只请求代理，不暴露 Dify API Key
- 后端统一负责：
  - 账号密码注册/登录
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
- `DIFY_API_KEY=你的 Dify 应用 API Key`
- `JWT_SECRET=长随机字符串`
- `DB_PATH=./data/store.json`

可选密码策略：
- `PASSWORD_MIN_LEN=6`
- `PASSWORD_MAX_LEN=72`
- `PASSWORD_PBKDF2_ITERATIONS=120000`

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
- `POST /api/auth/register` 账号注册并返回 token
- `POST /api/auth/login` 账号密码登录
- `GET /api/auth/me` 获取当前用户

### 记录
- `POST /api/nutrition/run` 运行工作流并写入当日记录（需 Bearer Token）
- `GET /api/records` 获取当前用户记录（需 Bearer Token）

## 数据存储
- 默认使用 JSON 文件：`DB_PATH` 指定路径。
- 想要真正长期保存，建议：
  - Render 挂载持久磁盘，并把 `DB_PATH` 设为 `/var/data/store.json`
  - 或改接 MySQL/PostgreSQL。

## 安全建议
- `DIFY_API_KEY`、`JWT_SECRET` 仅存后端，不要提交到仓库。
- 生产环境请把 `CORS_ORIGIN` 限制为你的前端域名。
- 可对登录与提交接口加限流，防止暴力尝试。
