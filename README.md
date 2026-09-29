# 3R Waterline

3R Waterline 是一个跨平台桌面悬浮窗，用来显示 3R 社区账户的实时剩余额度。它直接在应用内打开 3R 官方登录页，登录状态只保存在当前操作系统用户的隔离应用会话中，不读取或复制系统浏览器的 Cookie，也不保存密码。

## 当前版本

`v0.1.4` 提供 Windows 和 macOS 社区预览构建：

- `3R.Waterline_0.1.4_x64-setup.exe`：Windows 安装版（NSIS，推荐）。
- `three_r_waterline.exe`：Windows 便携版，无需安装。
- `3R.Waterline_0.1.4_universal.dmg`：macOS 通用安装镜像（Apple Silicon 与 Intel）。
- Windows 构建同时会生成 MSI；当前公开 Release 以 NSIS 安装版和便携版为主。

## 下载与安全提示

从浏览器直接下载的 `.exe` 会带上 Windows 的"来自网络"标记（Mark of the Web），而本项目尚未购买代码签名证书，因此 Windows 运行这些文件时会弹"打开文件 - 安全警告（无法验证发布者）"。这是未签名程序的正常提示，不代表文件被篡改；Release 资产列表提供 SHA256 摘要，可下载后自行比对。

- **Windows 安装版（推荐）**：仅运行安装包时最多提示一次（如遇 SmartScreen"Windows 已保护你的电脑"，点"更多信息 → 仍要运行"）；安装完成的程序日常运行和开机自启不再弹窗。
- **Windows 便携版**：不解除锁定的话，每次启动（含开机自启）都会弹。解除一次即可永久消除：右键 EXE → 属性 → 勾选"解除锁定"，或在 PowerShell 中执行：

  ```powershell
  Unblock-File -Path 'C:\完整路径\three_r_waterline.exe'
  ```

- **macOS DMG**：未签名公证，首次打开需在"系统设置 → 隐私与安全性"中允许。

彻底消除"未知发布者"提示需要可信的代码签名，项目正在评估面向开源项目的免费/低价签名方案（如 SignPath Foundation、Certum 开源证书）。

## 功能

- 圆形水瓶和 Traffic Monitor 两种悬浮显示模式。
- 周额度使用绿色、月额度使用蓝色，金额直接显示在条/瓶上。
- 支持多个订阅切换与自动轮换。
- 开机自动启动；每次启动先读取一次最新额度，之后按不短于 5 分钟的间隔更新。
- 拖动贴边后自动隐藏，鼠标移入把手恢复，离开后自动重新贴边；支持四个屏幕边缘。
- Windows 系统托盘菜单、右键设置、界面大小和主题适配。
- “清除本机登录信息”会删除当前设备的登录状态、缓存额度和自动启动项。

## 安装与使用

1. 下载并运行 NSIS 安装程序，或直接运行便携版 EXE。
2. 首次启动点击“登录 3R”，在应用内的官方登录窗口完成登录。
3. 登录成功后关闭登录窗口，悬浮窗会读取并显示当前订阅额度。
4. 右键悬浮窗或托盘图标进入设置。

## 安全设计

应用只使用 3R 官方站点签发的隔离 Login State。密码由官方登录页接收，3R Waterline 不读取密码，不访问用户默认浏览器的 Cookie。便携版复制给其他用户时不会携带原用户的登录状态；如需彻底清理本机数据，可在设置中使用“清除本机登录信息”。

## 开发

```powershell
npm install
npm test
npm run build
npm run desktop:dev
```

构建 Windows 安装包：

```powershell
npm run desktop:build
```

macOS 构建由 GitHub 的 macOS 构建机生成通用 DMG。该包未完成 Apple Developer 签名、公证或真实 Mac 登录流程验收；首次打开时 macOS 可能要求用户在“系统设置 → 隐私与安全性”中明确允许。社区用户可自行构建和修复平台差异。

## 发布

仓库采用 Public GitHub repository。推荐使用 GitHub CLI/API 完成仓库创建、推送和 Release 上传，不需要先打开 GitHub 网页手动创建项目。macOS 使用同一 Tauri 框架；Release 提供未签名的社区构建，但不宣称 Apple 签名、公证或真实 macOS 环境验收。详见 [release-notes.md](release-notes.md)。

## 许可证

本项目暂未选择开源许可证。若希望社区可以合法修改和再发布，请在 GitHub 发布前补充许可证文件（例如 MIT）。
