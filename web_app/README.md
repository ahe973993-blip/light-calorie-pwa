# 网页版 AI 营养师（小红书风格）

## 功能
- 上传早餐/午餐/晚餐图片
- 填写三餐食物与克重，调用 Dify 工作流出报告
- 时间线：按天展示早中晚照片 + 今日总热量
- 周统计图：近 7 天热量柱状图
- 体重趋势图：近 14 次记录折线趋势
- 连续打卡天数
- PWA：可安装到手机桌面（像 App 一样）

## 文件
- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `service-worker.js`
- `icons/*`

## 本地启动
建议通过本地静态服务器访问：

```bash
cd web_app
python -m http.server 8080
```

浏览器打开：
- `http://localhost:8080`

## 推荐使用后端代理
页面默认开启“使用后端代理（推荐上线）”：
- Proxy URL: `http://localhost:8787`
- 前端无需填写 API Key

后端代理请看：
- `../proxy_server/README.md`

## 直连模式（仅开发调试）
关闭“使用后端代理”后，才需要填写：
- Base URL: `http://localhost/v1`
- API Key: 你的 Dify 应用 API Key
- user: 任意唯一字符串（如 `xhs-web-user`）

## PWA 安装
### iPhone (iOS Safari)
1. 打开网页
2. 点击分享按钮
3. 选择“添加到主屏幕”

### Android (Chrome)
1. 打开网页
2. 点击浏览器菜单
3. 选择“安装应用”或“添加到主屏幕”

## 注意
- 前端直连会暴露 API Key，仅建议本地或内网使用。
- 生产环境建议一定走后端代理。
- 时间线、周统计、体重趋势都保存在浏览器本地 `localStorage`。
