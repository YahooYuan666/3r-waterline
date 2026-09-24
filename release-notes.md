# 3R Waterline v0.1.4

社区预览版：官方站点切到 `code.3rcd.com`。其余行为与 v0.1.3 相同。

## 下载

- `3R.Waterline_0.1.4_x64-setup.exe`：Windows 安装版（推荐）。
- `three_r_waterline.exe`：Windows 便携版。
- `3R.Waterline_0.1.4_universal.dmg`：macOS 通用安装镜像（Apple Silicon 与 Intel）。

## 已包含

- 登录与额度读取改为 `https://code.3rcd.com/`，不再请求 `https://grok.3rcd.com/` 或 `https://ai.3rcd.com/`。
- 悬浮窗只显示周/月订阅额度；已移除 `Grok 直充余额`、`/auth/me` 和可用余额轨。
- 网络失败与登录过期分开处理：暂时连不上时保留上次额度并提供重新连接；仅 401/403 才要求重新登录。
- 圆形水瓶、Traffic Monitor、大/中/小尺寸、Graphite Rail 深色视觉。
- 四向贴边隐藏：14px 把手、周绿/月蓝各 10 点、点高 2px、点距 2px、组距 8px。刻度按设备像素整数绘制。
- 单实例、托盘菜单、右键设置、开机自动启动。
- 每次启动先读取最新额度，之后以至少 5 分钟的间隔更新。

## 已知限制

项目使用 Tauri 2，Windows 已完成本机构建。macOS DMG 由 GitHub macOS 构建机生成，为 Intel 与 Apple Silicon 的通用包；它尚未在真实设备完成登录、窗口、自动启动、签名和公证验收。该包没有 Apple Developer 签名或公证，macOS 用户需要自行承担首次打开的安全提示并根据需要修复平台差异。

## 校验

- 前端测试：54 项通过。
- Windows Tauri release 构建：通过（便携文件名 `three_r_waterline.exe`）。
- macOS universal 构建由本 Release 的 GitHub macOS runner 生成并上传；该 runner 会运行前端测试。
