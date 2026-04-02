# 后端代理版（前端不暴露 API Key）

## 作用
- 前端只请求代理，不保存 Dify API Key
- 代理负责上传图片到 Dify，并调用工作流
- 适合生产上线

## 目录
- `proxy_server/`：后端代理服务
- `web_app/`：前端页面（默认走代理模式）

## 1) 配置环境变量
```bash
cd proxy_server
cp .env.example .env
```

编辑 `.env`：
- `DIFY_BASE_URL=http://localhost/v1`
- `DIFY_API_KEY=你的Dify应用API_KEY`
- `PORT=8787`
- `CORS_ORIGIN=*`

## 2) 安装依赖并启动
```bash
cd proxy_server
npm install
npm start
```

启动后：
- 代理健康检查：`http://localhost:8787/api/health`
- 前端页面（由代理服务直接托管）：`http://localhost:8787`

## 3) 前端如何用
页面默认勾选“使用后端代理（推荐上线）”：
- Proxy URL：`http://localhost:8787`
- 无需在前端填写 API Key

## API
### `GET /api/health`
返回代理健康状态和是否读取到 API Key。

### `POST /api/nutrition/run`
`multipart/form-data` 字段：
- `height_cm`
- `weight_kg`
- `age`
- `gender`
- `activity_level`
- `breakfast_items`
- `lunch_items`
- `dinner_items`
- `breakfast_image` (file)
- `lunch_image` (file)
- `dinner_image` (file)
- `user` (optional)

响应：
- `ok`
- `report`
- `total_kcal`
- `run` (Dify 原始响应)

## 安全说明
- API Key 仅保存在后端 `.env`，不会出现在浏览器网络请求中。
- 生产建议：
  - 把 `CORS_ORIGIN` 设置为你的前端域名（不要用 `*`）
  - 代理服务放在 HTTPS 之后（Nginx/Cloudflare）
  - 为 `/api/nutrition/run` 增加鉴权与限流
