# 轻卡小记 iOS App（SwiftUI）

已实现功能：
- 三餐图片上传（早餐/午餐/晚餐）
- 体征与食物克重输入
- 调用 Dify API：
  - `POST /files/upload`
  - `POST /workflows/run`
- 报告展示
- 时间线功能：按天展示三餐照片和总热量（本地持久化）

## 项目位置
- `ios_app/LightCalorieTimeline`

## 生成 Xcode 工程
本项目使用 XcodeGen 描述工程：

1. 安装 XcodeGen（Mac 上执行）：
```bash
brew install xcodegen
```

2. 生成工程：
```bash
cd ios_app/LightCalorieTimeline
xcodegen generate
```

3. 打开工程：
```bash
open LightCalorieTimeline.xcodeproj
```

## 运行前配置
在 App 首页的“接口配置”里填写：
- Base URL: `http://localhost/v1`
- API Key: 你的 Dify API Key
- user: 任意字符串（如 `ios-user`）

## 重要说明
- iOS 模拟器可直接用 `http://localhost/v1`（如果 Dify 在同一台 Mac 上运行）。
- 真机调试时，`localhost` 指向手机本机，请改成电脑局域网 IP，例如：
  - `http://192.168.1.10:80/v1`
- API Key 当前在客户端直连，仅适合开发测试；上线建议通过你自己的后端代理转发。
