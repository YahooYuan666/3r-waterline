# 本轮复核报告

## 复核结论

本轮范围内未发现阻塞缺陷。Traffic Monitor 的文字层设置了 `pointer-events: none`，全局不可选规则对登录输入框恢复为可选文本；圆瓶和横条均由尺寸状态驱动，贴边把手按左右边缘显示并保留 14px 可见区域。

## 独立证据

- 前端单元测试：4 个测试文件、33 个测试全部通过。
- TypeScript/Vite 生产构建通过。
- Rust `cargo check` 通过。
- 原生桌面交互检查通过：单实例、拖动、贴边恢复、隐藏、样式切换、菜单消失和二次启动恢复均为 True。
- Windows release 打包成功，生成 MSI 与 NSIS 安装包。

## 未覆盖项

macOS 原生窗口、菜单栏、Auto-start 和官方登录流程仍需在真实 macOS 环境进行平台验收；本轮未宣称已完成该平台验证。

## 用户回归问题复核

- `pwsh -File scripts/desktop-interaction-check.ps1`：`EdgeHideRearmed=True`、`SettingsInsideWorkArea=True`，并保持其他原生控制断言为 True。
- `npm test -- --run`：33 tests passed，包含恢复位置不可再次立即判定为贴边、设置窗口夹紧和小工作区尺寸适配测试。

## Release 独立复核

使用 `src-tauri/target/release/three_r_waterline.exe` 重新运行 `scripts/desktop-interaction-check.ps1`，结果为：

```text
SingleInstance         : True
LiveProcessCount       : 1
Dragged                : True
EdgeTabRestored        : True
EdgeHideRearmed        : True
SettingsInsideWorkArea : True
Hidden                 : True
TrafficSelected        : True
NativeMenuDismissed    : True
RestoredBySecondLaunch : True
```

因此本轮两个回归问题在 release 构建中也有可重复的绿色证据，而不是只在 debug 构建中通过。
补充：同一 release 回归连续运行两次均通过；菜单脚本在读取前会关闭旧弹出菜单并对窗口隐藏状态短暂轮询，降低桌面环境瞬态误报。

## 2026-08-24 增量复核

### 通过项

- Edge Hide 的自动重贴边不再依赖单次 `mouseleave`：恢复后由定时轮询确认指针离开，且用户拖动离开会取消 dock 状态。
- 左、右、上、下四向定位和把手方向由 `edge-hide.test.ts` 覆盖；把手是 DOM/CSS 点阵，周/月点数按当前剩余比例生成。
- Traffic Monitor 使用两行内在高度，文本层 `pointer-events: none` 且不可选；中/小档使用普通字重和省略列，避免月额度重叠。
- 设置标题栏保持原生拖动区域，移动期间按工作区夹紧；打开设置时也会先夹紧当前尺寸。
- 原生 capture 现在接收稳定订阅 ID、服务端 reset/剩余天数和字段别名；缺失周期时隐藏该周期，缺失 reset 时保留有效额度但隐藏重置行。Rust 测试覆盖“取消周限额、修改月上限”和“缺 reset 仍保留额度”。

### 新证据

- 前端：4 个测试文件、40 tests passed。
- Rust：2 tests passed；`cargo check` 通过。
- Release：`edge-autohide-check.ps1` 三项均为 `True`；`desktop-interaction-check.ps1` 的单实例、拖动、贴边恢复/重触发、自动重贴边、设置工作区夹紧、Traffic 切换、原生菜单消失和二次启动恢复均为 `True`。
- 新增回归：小加油包“剩余 7 天（截止日期）”被识别；Traffic 中/小档使用完整宽度、紧凑 reset 文本和无千位分隔符；恢复位置与屏幕边缘齐平，避免把手附近闪烁。

### 保留限制

- macOS 原生窗口、菜单栏、Auto-start 和登录流程仍需真实 macOS 设备验收；本轮只验证 Windows release。
- 3R 官方接口字段若发生未覆盖的结构性变更，会进入安全的 Unsupported/Schema Mismatch，不会显示猜测额度。

## 2026-08-24 本轮问题复核

- 网页真实 DOM 与官方前端 bundle 交叉核对：页面读取 `/subscriptions`，小加油包使用 `expires_at`，额度仍在 `group.monthly_limit_usd` 与 `monthly_usage_usd`。桌面端已改为同一路径，并覆盖无 status 的有效/过期记录测试。
- Traffic 中/小档改为两行栅格，金额与 reset 不再共用一条窄横向空间；现有 `pointer-events: none` 与全局不可选规则保持不变。
- 贴边 guard 只在指针同时接近当前贴边方向且落在恢复窗口的横/纵范围内生效，避免“贴边附近闪烁”；离开该走廊后保留自动重贴边行为。

### 新鲜证据

- 前端 43 tests、Rust 4 tests 全部通过；生产构建、Cargo check/fmt、diff hygiene 均通过。
- Release `edge-autohide-check.ps1` 在隔离 WebView2 配置下三项均为 `True`；`desktop-interaction-check.ps1` 全部桌面断言均为 `True`。

### 仍保留限制

- macOS 原生窗口、菜单栏、Auto-start 和官方登录流程仍需真实 macOS 设备验收；本轮没有把 Windows 证据外推为 macOS 已完成。

## Traffic 无限变宽回归

- 已确认并修复宽度反馈环：ResizeObserver 不再把 100% 内容宽度回写到原生窗口，只写固定档位宽度和内容高度。
- Release 桌面回归所有断言通过；Traffic 状态下窗口宽度连续采样 `288, 288, 288, 288, 288, 288px`。

## 本轮视觉复核

- 水瓶模式根页面滚动已由 `html/body/#root` 与舞台层统一禁止；设置对话框仍保留内部滚动。
- 贴边把手现在是每周期 10 段密集细线，侧向为横线竖排、上下为竖线横排，颜色和亮起数量对应周/月余额。
- Traffic 中/小档保持单行三列，字体分别为 11px/700 与 9px/700，不再使用上下行压缩布局。
- 前端 43 tests、生产构建和 Windows release 打包均通过。
