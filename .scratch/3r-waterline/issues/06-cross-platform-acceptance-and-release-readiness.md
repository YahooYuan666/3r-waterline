# 06 - 验收 Windows/macOS 并准备发布

**要构建的内容:** 在 Windows 和 macOS 上独立验证完整 3R Waterline 体验，为真实官方登录、隐私保障、刷新行为和窗口控制保留证据；任一端未通过前不宣称该端已支持。

**依赖:** 05 - 完成桌面控制与清除此设备数据。

**Status:** ready-for-agent

- [ ] Windows 和 macOS 验收均使用授权测试账号验证官方 WebView 登录、Boot Lifecycle 首读、所选 Refresh Interval、Wake Refresh 和安全失败状态。
- [ ] 两端均验证 System Menu、Overlay Context Menu、Auto-start、Edge Hide、可用时的多显示器恢复，以及 Clear This Device 后必须重新登录。
- [ ] 审查证据确认 portable 应用文件不含 Login State 或账号数据，且测试产物不含秘密或真实订阅内容。
- [ ] 记录构建、测试、格式、差异卫生和用户验证证据；未验证的签名、公证或平台限制必须明确作为发布阻塞项，不能暗示已支持。
