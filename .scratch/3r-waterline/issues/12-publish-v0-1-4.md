# 12 - 发布 v0.1.4

**Type:** task  
**Status:** resolved

## 范围

- 将官方站点从 `grok.3rcd.com` 切到 `code.3rcd.com`，作为新的公开 GitHub Release 发布。
- 上传 Windows 安装版和便携版 `three_r_waterline.exe`，触发 GitHub macOS runner 生成并上传通用 DMG。

## 发布策略

- 保留已公开的 `v0.1.3`，不覆盖历史资产。
- 新版本使用 `v0.1.4`，对应当前 `main` 提交。

## 验收

- GitHub Releases 存在公开 `v0.1.4`。
- Release 包含 Windows NSIS 安装版、Windows 便携版 `three_r_waterline.exe` 及 macOS 通用 DMG。

## Answer

- 公开 Release：<https://github.com/YahooYuan666/3r-waterline/releases/tag/v0.1.4>
- 对应提交：`b0b1497 feat: switch official host to code.3rcd.com`
- GitHub Actions Windows 构建成功：<https://github.com/YahooYuan666/3r-waterline/actions/runs/36000625115>
- GitHub Actions macOS 构建成功：<https://github.com/YahooYuan666/3r-waterline/actions/runs/36000629492>
- 资产：`3R.Waterline_0.1.4_x64-setup.exe`、`three_r_waterline.exe`、`3R.Waterline_0.1.4_universal.dmg`
