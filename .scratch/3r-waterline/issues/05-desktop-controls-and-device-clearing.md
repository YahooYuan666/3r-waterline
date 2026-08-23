# 05 - 完成桌面控制与清除此设备数据

**要构建的内容:** 已登录用户能够通过 System Menu 和 Overlay Context Menu 管理 3R Waterline，安全使用 Auto-start 与 Edge Hide，并清除本机所有账号绑定数据。

**依赖:** 04 - 实现 Boot Lifecycle 与刷新调度。

**Status:** claimed

- [ ] 首次成功登录后启用 Auto-start；用户可在设置中调整；它只为当前系统用户运行，并由 Clear This Device 移除。
- [x] 用户拖动悬浮窗到当前显示器工作区边缘后进入 Edge Hide，悬停或点击可恢复，绝不会只因闲置而丢失窗口。
- [ ] Windows 托盘和 macOS 菜单栏的 System Menu 提供显示/隐藏、设置、重新登录、Clear This Device 和退出；Overlay Context Menu 提供基础设置但不增加请求绕过。
- [ ] Clear This Device 删除 Login State、隔离会话数据、Subscription 内容、Quota Snapshot、账号绑定偏好和 Auto-start，只保留与账号无关的窗口位置偏好。
- [ ] 清除后重新启动必须完成新的官方登录，不能展示前一用户的订阅数据。
- [ ] 测试和平台集成检查覆盖菜单动作、贴边恢复、启动项注册/移除和本地数据清除。

## Comments

- 2026-08-23: edge hide now renders a dedicated high-contrast 14px restore tab in the visible strip instead of depending on an empty sliver of the centered vessel. Added a unit test for the restore tab; `npm test`, `npm run build`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `pwsh -File scripts/desktop-interaction-check.ps1` pass.
- 2026-08-23：贴边把手改为高对比度 14px 把手，并按左/右边缘定位；恢复位置移到贴边判定带之外，避免恢复后立即再次隐藏，用户再次拖到边缘时可重新触发。设置窗口改为 400 × 460、内容自适应滚动，并提供大/中/小界面尺寸选择；样式支持跟随系统明暗色调。
- 2026-08-23：故障回归发现恢复位置仍落在 12px 贴边判定带内，且从托盘打开设置时“显示窗口”和“打开设置”事件存在竞态。现将恢复位置移到判定带外，程序化恢复仅在移动抑制窗口内受保护；设置/登录窗口放大后按当前显示器工作区夹紧，设置打开期间暂停贴边监听；托盘设置动作改为先显示窗口、再发送设置事件。
- 2026-08-23：使用 release EXE 重跑桌面回归，`SettingsInsideWorkArea=True`、`EdgeHideRearmed=True`，并确认单实例、托盘菜单、隐藏/恢复、横条切换和二次启动恢复均通过。
- 2026-08-23：设置/登录窗口现在先按当前显示器工作区缩小自身物理尺寸，再夹紧位置；即使工作区小于默认 400 × 460，也不会仅靠坐标夹紧而把窗口留在屏幕外。新增小工作区回归测试。
- 2026-08-24：恢复贴边窗口后由持续指针轮询负责自动重贴边，用户拖动离开才会解除 dock；设置/登录窗口拖动期间持续夹紧到工作区。Traffic 横条改为内容内在高度并同步原生窗口尺寸；原生订阅字段支持服务端 reset/别名，缺少周限额时隐藏周栏，缺少 reset 时保留额度但隐藏重置行，不再显示猜测值。
- 2026-08-24：桌面端订阅请求与网页统一使用 `/subscriptions`，并按 `expires_at` 推导缺少显式 status 的有效/失效记录，补上小加油包。贴边自动重隐藏增加当前把手方向的指针激活走廊判断，指针靠边但仍在恢复窗口范围内时保持展开，避免闪烁；离开走廊后继续自动重贴边。
