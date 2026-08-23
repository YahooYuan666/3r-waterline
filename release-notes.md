# 3R Waterline v0.1.0

首个公开预览版。

## 下载

- `3R Waterline_0.1.0_x64-setup.exe`：Windows 安装版（推荐）。
- `three_r_waterline.exe`：Windows 便携版。
- `3R Waterline_0.1.0_x64_en-US.msi`：额外提供的 Windows MSI 安装包。

## 已包含

- 应用内 3R 官方登录窗口与隔离登录状态。
- 周/月额度金额显示、订阅切换和自动轮换。
- 圆形水瓶、Traffic Monitor、大/中/小尺寸。
- 四向贴边隐藏、点阵把手、恢复后自动重贴边。
- 单实例、托盘菜单、右键设置、开机自动启动。
- 每次启动先读取最新额度，之后以至少 5 分钟的间隔更新。
- 服务器取消周限额、调整月上限、加油包到期日期等页面变化的安全解析。

## 已知限制

本 Release 只宣称 Windows x64 构建。项目使用 Tauri 2，保留 Windows/macOS 的跨平台设计；但 macOS 尚未在真实设备上完成登录、窗口、自动启动、签名和公证验收，因此没有伪造 macOS 下载文件。macOS 用户可以自行构建并根据需要修复平台差异。

## 校验

- 前端测试：43 项通过。
- Rust 测试：4 项通过。
- Windows Tauri release 构建：通过。
- 桌面回归：单实例、拖动、四向贴边、自动重贴边、设置工作区夹紧、Traffic 切换和二次启动均通过。
