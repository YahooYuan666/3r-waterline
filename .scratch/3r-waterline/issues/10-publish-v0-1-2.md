# 10 - 发布 v0.1.2

**Type:** task  
**Status:** resolved

## 范围

- 将当前已推送的最新功能与视觉调整作为新的公开 GitHub Release 发布。
- 上传 Windows 安装版和便携版，触发 GitHub macOS runner 生成并上传通用 DMG。

## 发布策略

- 保留已公开的 `v0.1.1`，不覆盖历史资产。
- 新版本使用 `v0.1.2`，对应当前 `main` 提交。

## 验收

- GitHub Releases 存在公开 `v0.1.2`。
- Release 包含 Windows NSIS 安装版、Windows 便携版及 macOS 通用 DMG。

## 发布证据（2026-08-25）

- 公开 Release：<https://github.com/YahooYuan666/3r-waterline/releases/tag/v0.1.2>
- GitHub Actions Windows 构建成功：<https://github.com/YahooYuan666/3r-waterline/actions/runs/32864298704>
- GitHub Actions macOS 构建成功：<https://github.com/YahooYuan666/3r-waterline/actions/runs/32864302489>
- GitHub Releases API 已逐项确认三个实际资产：`3R.Waterline_0.1.2_x64-setup.exe`、`three_r_waterline.exe`、`3R.Waterline_0.1.2_universal.dmg`。
