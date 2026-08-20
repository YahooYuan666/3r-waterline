# 04 - 实现 Boot Lifecycle 与刷新调度

**要构建的内容:** 已登录用户在计算机启动时立即读取订阅页，之后按可预测周期更新，并在整个 Boot Lifecycle 中正确处理 Reset Countdown 校准与安全失败状态。

**依赖:** 03 - 接入官方登录窗口与安全 Login State。

**Status:** ready-for-agent

- [ ] 每次自动启动的 Boot Lifecycle 在展示当前额度前先请求当前订阅数据。
- [ ] 设置只提供 5、10、15、30、60 分钟的 Refresh Interval，默认 5 分钟，周期请求不早于所选间隔。
- [ ] 只有自上次成功读取已达到所选 Refresh Interval 时才执行 Wake Refresh。
- [ ] Reset Countdown 以页面提供的日/小时精度在本地推进，并在成功读取后重新校准，不产生额外请求。
- [ ] 首次读取的网络、认证和 Schema Mismatch 失败维持 Unverified State；同一 Boot Lifecycle 后续失败只保留最后一个 Verified Snapshot 并明确标示更新失败。
- [ ] 测试通过 Quota Monitor seam 证明启动首读、所有周期选项、睡眠恢复、普通 UI 操作无刷新绕过和失败状态迁移。
