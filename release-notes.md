# 3R Waterline v0.1.1

包含登录空状态修复的公开社区预览版。

## 下载

- `3R.Waterline_0.1.1_x64-setup.exe`：Windows 安装版（推荐）。
- `three_r_waterline.exe`：Windows 便携版。
- `3R.Waterline_0.1.1_universal.dmg`：macOS 通用安装镜像（Apple Silicon 与 Intel）。

## 已包含

- 应用内 3R 官方登录窗口与隔离登录状态。
- 周/月额度金额显示、订阅切换和自动轮换。
- 圆形水瓶、Traffic Monitor、大/中/小尺寸。
- 四向贴边隐藏、点阵把手、恢复后自动重贴边。
- 单实例、托盘菜单、右键设置、开机自动启动。
- 每次启动先读取最新额度，之后以至少 5 分钟的间隔更新。
- 服务器取消周限额、调整月上限、加油包到期日期等页面变化的安全解析。

## 修复

- Traffic Monitor 在“尚未登录”或没有可显示订阅时不再把原生窗口压缩到标题高度；登录入口始终保留在窗口可见区域。

## 已知限制

项目使用 Tauri 2，Windows 已完成本机构建与桌面回归。macOS DMG 由 GitHub macOS 构建机生成，为 Intel 与 Apple Silicon 的通用包；它尚未在真实设备完成登录、窗口、自动启动、签名和公证验收。该包没有 Apple Developer 签名或公证，macOS 用户需要自行承担首次打开的安全提示并根据需要修复平台差异。

## 校验

- 前端测试：47 项通过。
- Rust 测试：4 项通过。
- Windows Tauri release 构建：通过。
- GitHub macOS universal 构建：通过；macOS runner 前端测试 47 项通过。
- 桌面回归：单实例、拖动、四向贴边、自动重贴边、设置工作区夹紧、Traffic 切换和二次启动均通过。
