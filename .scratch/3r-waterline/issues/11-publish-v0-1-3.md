# 11 - 发布 v0.1.3

**Type:** task  
**Status:** claimed

## 范围

- 将 grok.3rcd.com 主机切换、去掉直充余额、连接/鉴权分离，以及 2px 设备像素贴边刻度作为新的公开 GitHub Release 发布。
- 上传 Windows 安装版和便携版 `three_r_waterline.exe`，触发 GitHub macOS runner 生成并上传通用 DMG。

## 发布策略

- 保留已公开的 `v0.1.2`，不覆盖历史资产。
- 新版本使用 `v0.1.3`，对应当前 `main` 提交。

## 验收

- GitHub Releases 存在公开 `v0.1.3`。
- Release 包含 Windows NSIS 安装版、Windows 便携版 `three_r_waterline.exe` 及 macOS 通用 DMG。
