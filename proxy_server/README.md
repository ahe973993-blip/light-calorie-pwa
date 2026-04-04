# 后端代理版（账号 + 云端同步）

## 作用
- 前端只请求代理，不暴露 Dify API Key
- 后端统一负责：
  - 手机号验证码登录
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
- `SMS_PROVIDER=mock`
- `DB_PATH=./data/store.json`

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
- `POST /api/auth/sms/send` 发送验证码
- `POST /api/auth/phone/login` 手机号登录
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
