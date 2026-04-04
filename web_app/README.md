# 网页版 AI 营养师（小红书风格）

## 功能
- 手机号验证码登录（云端账号）
- 上传早餐/午餐/晚餐图片并生成热量报告
- 云端时间线同步：按天展示早中晚照片 + 今日总热量
- 周统计图、体重趋势图、连续打卡天数
- PWA：可安装到手机桌面（像 App 一样）

## 文件
- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `service-worker.js`
- `icons/*`

## 本地启动
```bash
cd web_app
python -m http.server 8080
```
浏览器打开：
- `http://localhost:8080`

## 账号与同步
- 前端会调用后端账号接口：
  - `POST /api/auth/sms/send`
  - `POST /api/auth/phone/login`
  - `GET /api/auth/me`
  - `GET /api/records`
- 登录后数据按账号隔离，支持多设备同步。

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
- 页面已固定走后端代理，不再显示 API Key / Base URL 配置。
- 若前端与后端不在同一域名，可通过 URL 参数 `?api_base=https://你的后端域名` 指定后端地址。
