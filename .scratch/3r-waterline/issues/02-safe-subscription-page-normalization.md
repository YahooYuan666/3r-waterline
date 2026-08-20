# 02 - 安全解析订阅页并支持多订阅

**要构建的内容:** 悬浮窗能够接受脱敏的订阅页 HTML fixture，展示所有有效的 Supported Subscription，并安全隔离 Unsupported Subscription、Inactive Subscription 和 Schema Mismatch。

**依赖:** 01 - 建立桌面壳与 Quota Monitor。

**Status:** ready-for-agent

- [ ] 页面中的 `$已用 / $上限` 被识别为 Used Amount，并正确计算为 Remaining Amount 和对应水位。
- [ ] 包含多个 Supported Subscription 的页面通过一次读取更新所有订阅，用户可在悬浮窗中切换 Selected Subscription。
- [ ] 缺失、格式错误或不合理的周期值绝不生成猜测的 Quota Snapshot；无效卡片不阻塞有效同级订阅更新。
- [ ] 失效卡与未知卡显示获批状态；整页结构变更进入安全失败状态。
- [ ] fixture 测试覆盖有效周/月数据、多卡片、错误数据、失效卡和页面结构变更，且不含真实账号数据。
