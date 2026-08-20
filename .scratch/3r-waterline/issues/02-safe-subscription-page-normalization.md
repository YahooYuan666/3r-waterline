# 02 - 安全解析订阅页并支持多订阅

**要构建的内容:** 悬浮窗能够接受脱敏的订阅页 HTML fixture，展示所有有效的 Supported Subscription，并安全隔离 Unsupported Subscription、Inactive Subscription 和 Schema Mismatch。

**依赖:** 01 - 建立桌面壳与 Quota Monitor。

**Status:** resolved

- [x] 页面中的 `$已用 / $上限` 被识别为 Used Amount，并正确计算为 Remaining Amount 和对应水位。
- [x] 包含多个 Supported Subscription 的页面通过一次读取更新所有订阅，用户可在悬浮窗中切换 Selected Subscription。
- [x] 缺失、格式错误或不合理的周期值绝不生成猜测的 Quota Snapshot；无效卡片不阻塞有效同级订阅更新。
- [x] 失效卡与未知卡显示获批状态；整页结构变更进入安全失败状态。
- [x] fixture 测试覆盖有效周/月数据、多卡片、错误数据、失效卡和页面结构变更，且不含真实账号数据。

## Answer

- 已实现严格订阅页解析器，支持脱敏 fixture 与当前公开 3R Vue 卡片结构；不做整页文本猜测。
- 只读取订阅名、状态、周/月 Used Amount、Limit 和 Reset Countdown；金额按 `Limit - Used Amount` 计算为 Remaining Amount，币种不转换。
- 单卡错误隔离为 Unsupported，Inactive 不生成水位；缺少页面契约进入 Schema Mismatch。
- 原生 Tauri Windows WebView2 已接入字段白名单捕获，捕获结果进入同一解析器；不保存密码、Cookie、原始 HTML 或外部浏览器资料。
- `npm run test` 通过 19 项；`npm run build` 通过；`cargo check --manifest-path src-tauri/Cargo.toml` 通过；Windows EXE、MSI、NSIS 已重新生成。
