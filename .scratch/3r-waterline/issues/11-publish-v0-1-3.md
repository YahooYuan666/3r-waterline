# 11 - 发布 v0.1.3

**Type:** task  
**Status:** resolved

## 范围

- 将 grok.3rcd.com 主机切换、去掉直充余额、连接/鉴权分离，以及 2px 设备像素贴边刻度作为新的公开 GitHub Release 发布。
- 上传 Windows 安装版和便携版 `three_r_waterline.exe`，触发 GitHub macOS runner 生成并上传通用 DMG。

## 发布策略

- 保留已公开的 `v0.1.2`，不覆盖历史资产。
- 新版本使用 `v0.1.3`，对应当前 `main` 提交。

## 验收

- GitHub Releases 存在公开 `v0.1.3`。
- Release 包含 Windows NSIS 安装版、Windows 便携版 `three_r_waterline.exe` 及 macOS 通用 DMG。

## Answer

- 公开 Release：<https://github.com/YahooYuan666/3r-waterline/releases/tag/v0.1.3>
- 对应提交：`5870646 chore: release v0.1.3`
- GitHub Actions Windows 构建成功：<https://github.com/YahooYuan666/3r-waterline/actions/runs/35641814204>
- GitHub Actions macOS 构建成功：<https://github.com/YahooYuan666/3r-waterline/actions/runs/35641818467>
- 资产：`3R.Waterline_0.1.3_x64-setup.exe`、`three_r_waterline.exe`、`3R.Waterline_0.1.3_universal.dmg`
