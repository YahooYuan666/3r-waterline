# 01 - 建立桌面壳与 Quota Monitor

**要构建的内容:** 交付可运行的 3R Waterline 桌面悬浮窗。它通过唯一的 `Quota Monitor` 边界展示模拟的 `Verified Snapshot`、`Unverified State` 和失败状态，在未连接真实 3R Account 前即可看到获批的周绿、月蓝双液仓圆瓶。

**依赖:** 无 - 可立即开始。

**Status:** resolved

**执行方式:** current Codex + OpenAI；Windows-native；不交接。

- [x] 应用能启动为紧凑桌面悬浮窗，并只根据 `Quota Monitor` 发布的状态渲染双液仓圆瓶。
- [x] 周、月液仓分别展示突出的 Remaining Amount、次要的上限和日/小时精度的 Reset Countdown，数据来自模拟输入。
- [x] `Verified Snapshot`、`Unverified State`、更新失败、Unsupported Subscription 和 Inactive Subscription 具有清晰不同的可见状态，且不产生真实 3R 请求。
- [x] 协调器行为通过可控时钟和可替换的订阅页读取器验证，不依赖 UI 内部实现。

## 完成证据

- `Quota Monitor` 现发布完整的悬浮窗状态，包括选择的 Subscription、Verified/Unverified、更新失败和 Schema Mismatch。
- 已使用模拟读取器；没有发起 3R 网络请求，也没有持久化账号、密码或会话数据。
- `npm run test` 通过 9 项测试；`npm run build` 通过；`npm run desktop:build -- --debug` 已生成 Windows 调试版 EXE、MSI 和 NSIS 包。
- 380 × 480 浏览器窄窗口复核确认无滚动溢出，且 Unsupported 与 Inactive 订阅可通过翻页显示。
- 256 × 256 逻辑像素视口复核确认：240px 圆瓶四周各有 8px 透明余量，周/月信息均为 13px、700 字重，最长金额行、倒计时和页面均无溢出。

## 变更记录

- 2026-08-21：按用户确认将悬浮层压缩为透明无标题栏的单个圆形双液仓。周、月金额、上限和 Reset Countdown 均直接显示在瓶内；不再显示“3R 水位”“模拟额度”、外框或外置数据区。
- 2026-08-21：按用户确认，Overlay Context 只显示并轮询 Supported Subscription；Unsupported Subscription 和 Inactive Subscription 继续保留在内部状态中用于安全判断，但不作为可翻页选项展示。
- 2026-08-21：按用户要求进一步压缩悬浮窗。默认窗口改为 256 × 256 logical px，圆瓶改为 240px，保留现有 13px 粗体金额与倒计时；详见 `docs/research/compact-overlay-sizing.md` 的官方规范调研与跨平台验收条件。
- 2026-08-22：按用户要求新增可选的 Traffic Monitor 样式。它使用 256 × 122 logical px 的无外框双行进度条，上方绿色周额度、下方蓝色月额度；每条内直接显示周期、Remaining Amount、无小数上限和 Reset Countdown。样式切换在设置关闭后才调整窗口大小，且不会改变用户已拖动的位置。
- 2026-08-23：按用户反馈压缩默认圆瓶为大档 224 × 224 logical px，并增加中档 180 × 180、小档 144 × 144；Traffic Monitor 同步提供大/中/小三档。两种样式统一禁止文本选择，圆瓶改为参考 Traffic Monitor 的深色半透明底、白色粗体文字和半透明绿/蓝水位。
- 2026-08-24：Traffic Monitor 中/小档改为标签、金额、倒计时分行布局，避免窄宽度下月额度文字挤压；金额分母不显示千位分隔符。真实网页结构中的“小加油包”只有到期日期且没有 reset，仍保留其月额度并隐藏伪造的“后重置”。

## Answer

首票的紧凑视觉规格已完成并重新验证。圆瓶可见面积比原 280px 版本减少约 26.5%，窗口占用面积比原 320 × 320 减少 36%，没有缩小用户指定的文字字号或省略金额信息。
