# 15 - 发布 v0.1.6：Gemini 多账号号池

**Type:** task  
**Status:** resolved

## 范围

- 支持绑定多个 Google 账号，读取各自的 Antigravity（Gemini）5 小时限额与周限额。
- 新增 Gemini 号池汇总页，按各账号剩余比例的等权平均聚合，倒计时取最近一次重置时间。
- 设置中提供「显示单个 Gemini 账号」开关与账号管理（添加、逐个移除、退出全部）。
- 修复首次登录后悬浮窗锁定在 Gemini 页、无法切回 3R 订阅的问题。

## 发布策略

- v0.1.5 已公开发布且其线上资产早于多账号功能，因此递增为 `v0.1.6` 重新发布，不覆盖历史资产。

## 验收

- GitHub Releases 存在公开 `v0.1.6`。
- Release 包含 Windows NSIS 安装版与便携版；macOS DMG 由 GitHub Actions 生成后附加。

## Answer

- 公开 Release：<https://github.com/YahooYuan666/3r-waterline/releases/tag/v0.1.6>
- 对应提交：`fc8b2f9 chore: release v0.1.6 with Gemini account pool`
- 关键修复提交：`b90806a fix: keep 3R pages in the pager when Gemini pool exists`
- 测试：前端 64 项通过，Rust 库 11 项通过。
- macOS 工作流：<https://github.com/YahooYuan666/3r-waterline/actions/runs/38033322030>

## Comments

- 根因记录：页面列表 `availablePages` 改为读取 `monitor.getState()` 而非响应式的 `state`，且 `useMemo` 依赖项不含 `state`，导致首屏计算后不再重算，3R 订阅始终缺失、导航箭头不渲染。现已直接依赖 `state.subscriptions` 与 `state.selectedSubscriptionId`，并补充回归测试断言「3R 与 Gemini 号池并存时导航按钮存在且可点击」。