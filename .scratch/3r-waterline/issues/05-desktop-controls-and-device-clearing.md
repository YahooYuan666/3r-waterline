# 05 - 完成桌面控制与清除此设备数据

**要构建的内容:** 已登录用户能够通过 System Menu 和 Overlay Context Menu 管理 3R Waterline，安全使用 Auto-start 与 Edge Hide，并清除本机所有账号绑定数据。

**依赖:** 04 - 实现 Boot Lifecycle 与刷新调度。

**Status:** ready-for-agent

- [ ] 首次成功登录后启用 Auto-start；用户可在设置中调整；它只为当前系统用户运行，并由 Clear This Device 移除。
- [ ] 用户拖动悬浮窗到当前显示器工作区边缘后进入 Edge Hide，悬停或点击可恢复，绝不会只因闲置而丢失窗口。
- [ ] Windows 托盘和 macOS 菜单栏的 System Menu 提供显示/隐藏、设置、重新登录、Clear This Device 和退出；Overlay Context Menu 提供基础设置但不增加请求绕过。
- [ ] Clear This Device 删除 Login State、隔离会话数据、Subscription 内容、Quota Snapshot、账号绑定偏好和 Auto-start，只保留与账号无关的窗口位置偏好。
- [ ] 清除后重新启动必须完成新的官方登录，不能展示前一用户的订阅数据。
- [ ] 测试和平台集成检查覆盖菜单动作、贴边恢复、启动项注册/移除和本地数据清除。
