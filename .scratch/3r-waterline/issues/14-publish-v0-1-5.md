# 14 - 发布 v0.1.5

**Type:** task  
**Status:** resolved

## 范围

- 修复周限额使用超额时错误隐藏周限额展示的 BUG（超额时保留周栏并展示剩余 $0 及重置倒计时）。
- 3R 站点不再内置硬编码，登录时同步填写并持久化站点地址。
- 新增 Google OAuth 登录支持及 Antigravity（Gemini）5 小时限额与周限额的手动查询。
- 修复 Windows 注册表分号多协议代理串识别，并支持常见本地代理端口（7890 等）自动探测与适配，无需开启全局 VPN/TUN 即可正常查询 Gemini。
- 优化 Traffic Monitor 标签宽度自适应与 24 小时内重置倒计时格式（以小时和分钟展示）。
- 新版本使用 `v0.1.5`，构建并上传 Windows 安装版、便携版及触发 macOS 通用 DMG 构建。

## 验收

- GitHub Releases 存在公开 `v0.1.5`。
- Release 包含 Windows NSIS 安装版、Windows 便携版 `three_r_waterline.exe` 及 macOS 通用 DMG。
