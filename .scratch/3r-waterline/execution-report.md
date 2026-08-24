# 本轮执行报告

## 环境

- Windows-native 项目：`D:\Projects\3r-waterline`。
- 原生 Node/npm、Rust/Cargo 和 Windows Tauri toolchain 可用；环境预检无阻塞项。

## 范围

- Traffic Monitor 文本不可选、不可作为交互目标。
- 圆形水瓶压缩、Traffic Monitor 配色、白色粗体文字和半透明水位。
- 大/中/小三档悬浮尺寸及持久化选择。
- 可见贴边把手、左右方向、恢复后再次贴边触发。
- 设置窗口自适应滚动、较小标题、系统明暗色适配。
- Vite 开发端口固定为 Tauri 配置的 1420。

## 变更位置

- `src/App.tsx`
- `src/styles.css`
- `src/domain/edge-hide.ts`
- `src/domain/edge-hide.test.ts`
- `src-tauri/tauri.conf.json`
- `vite.config.ts`

## 验证

- `npm test -- --run`：33 tests passed。
- `npm run build`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `pwsh -File scripts/desktop-interaction-check.ps1`：SingleInstance、Dragged、EdgeTabRestored、Hidden、TrafficSelected、NativeMenuDismissed、RestoredBySecondLaunch 均为 True。
- `npm run desktop:build`：成功生成 Windows release EXE、MSI 和 NSIS 安装包。

## 故障回归修复

- 恢复位置从贴边判定带内移到判定带外；恢复后再次拖回边缘可重新进入 Edge Hide。
- 设置/登录窗口放大后调用工作区夹紧；设置或登录打开时不触发 Edge Hide。
- 托盘“设置”不再与独立恢复事件竞态，先显示窗口再打开设置。

## Release 复核

使用最新 release EXE 重新运行桌面回归：

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

补充检查：`npm test -- --run`（33 项通过）、`npm run build`（通过）、`cargo check --manifest-path src-tauri/Cargo.toml`（通过）、`git diff --check`（无差异卫生错误）。
桌面回归连续运行两次均通过；脚本对托盘/原生菜单的瞬态增加了关闭旧弹出菜单、重试和隐藏状态短轮询。
- 原生回归脚本新增 `EdgeHideRearmed=True` 和 `SettingsInsideWorkArea=True` 断言。

## 2026-08-24 增量修复

- Edge Hide 恢复后改为持续轮询指针是否仍在悬浮窗内；离开后自动重新贴边，拖动离开后停止轮询，不需要再次拖动才能触发。
- 设置/登录窗口拖动期间按当前显示器工作区持续夹紧，避免设置面板被拖到屏幕外。
- Traffic Monitor 的两条横条进一步压缩为内容内在高度，并通过 `ResizeObserver` 将原生窗口高度同步到实际内容，消除上下滚动/空白。
- 原生订阅归一化支持稳定订阅 ID、更多服务端字段别名、服务端 reset 时间和剩余天数；缺少 reset 时保留有效额度并隐藏重置行，不生成 `0d 0h` 等猜测值。
- 服务器移除周限额、修改月上限、缺少 reset 仍保留周期的 Rust 回归测试已加入。

## 最新验证

- `npm test -- --run`：40 tests passed。
- `npm run build`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：2 Rust tests passed。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `git diff --check`：通过。
- `scripts/edge-autohide-check.ps1`（release）：`HiddenAfterDrag=True`、`RestoredOnHover=True`、`AutoRehiddenAfterPointerLeave=True`。
- `scripts/desktop-interaction-check.ps1`（release）：单实例、桌面贴边恢复/重触发、设置工作区夹紧、自动重贴边、Traffic 切换、原生菜单消失、二次启动恢复均为 `True`；四向坐标由 `src/domain/edge-hide.test.ts` 覆盖。

本轮还覆盖了小加油包的“剩余 7 天 + 截止日期”文本、无 reset 的原生周期，以及 Traffic 中/小档使用完整横条宽度与无千位分隔符。

四向边缘的纯逻辑覆盖位于 `src/domain/edge-hide.test.ts`；不再保留不稳定的桌面四向 throwaway 脚本，避免把瞬态鼠标坐标误报为产品故障。

## 2026-08-24 本轮问题修复

- 桌面端订阅读取接口改为与网页一致的 `/subscriptions`；该接口包含“小加油包”这类只有 `expires_at` 的记录。缺少显式 `status` 时按截止时间推导有效/失效，避免把有效加油包误判为 Unsupported。
- 真实网页 DOM 已核对：小加油包的额度位于“每月”块，截止日期在独立的“到期时间”行；无 reset 时保留额度但不伪造“后重置”。
- Traffic Monitor 中/小档改为两行紧凑文字布局，周期标签独立占列，金额与 reset 行互不挤压；金额分母继续使用无千位分隔符格式。
- 贴边自动重隐藏增加屏幕边缘激活走廊和窗口垂直/水平范围判断：指针仍贴着当前把手所在边缘时保持展开，避免隐藏后把手立即再次触发造成闪烁；指针离开走廊后仍自动重贴边。

## 本轮验证

- `npm test -- --run`：43 tests passed。
- `npm run build`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：4 tests passed。
- `cargo check --manifest-path src-tauri/Cargo.toml`、`cargo fmt -- --check`、`git diff --check`：通过。
- `npm run desktop:build`：重新生成 Windows release EXE、MSI 和 NSIS 安装包。
- Release `scripts/edge-autohide-check.ps1`（隔离测试配置）：`HiddenAfterDrag=True`、`RestoredOnHover=True`、`AutoRehiddenAfterPointerLeave=True`。
- Release `scripts/desktop-interaction-check.ps1`：单实例、拖动、贴边恢复/重触发、自动重贴边、设置工作区夹紧、Traffic 切换、原生菜单消失和二次启动恢复均为 `True`。

## 2026-08-24 Traffic 无限变宽修复

- 根因是 `ResizeObserver` 同时把 `.waterline-overlay` 的宽度写回原生窗口，而 Traffic 内容本身又是 `width: 100%`，形成“窗口变宽 → 内容变宽 → 窗口再变宽”的反馈环。
- 现在 Traffic 只根据固定的大/中/小档宽度设置原生窗口，`ResizeObserver` 仅调整两条横条所需高度；横条和文字层增加 `min-width: 0`，防止长金额参与撑宽。
- Release 实测窗口宽度连续 6 次采样均为 `288px`，高度为 `81px`，无持续增长。

## 2026-08-24 本轮视觉回归

- 根页面、`#root` 和水瓶舞台统一 `overflow: hidden`，设置对话框仍使用自身的内部滚动区域，不再让水瓶模式出现外层滚动条。
- 贴边把手改为参考样本的密集细线：每个周期 10 段，侧贴边显示横向细线竖向密排，上/下贴边显示竖向细线横向密排，周/月分别使用绿色/蓝色，剩余比例通过亮起段数表示。
- Traffic 中/小档恢复单行三列布局，取消上下行；中档 11px/700、小档 9px/700，金额和倒计时不再过度压缩。
- Release `edge-autohide-check.ps1`：三项均为 `True`；窗口宽度固定逻辑保持不变。

## 2026-08-24 v0.1.1 发布准备

- 修复 Traffic Monitor 无额度/未登录状态被 `ResizeObserver` 压缩为标题高度的问题；空状态容器现在保留登录按钮所需的实际高度。
- 增加 `resolveTrafficOverlayHeight` 回归测试和 Traffic 空状态渲染测试。
- Tauri 配置开启 macOS 透明窗口所需的 `macOSPrivateApi` 与 Cargo `macos-private-api` 特性。
- 增加 `.github/workflows/release-macos.yml`，在 `macos-14` 上构建 universal Apple Silicon/Intel DMG，并上传到既有 Release；不执行 Apple 签名或公证。

## v0.1.1 本机验证

- `npm test -- --run`：47 项通过。
- `npm run build`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：4 项通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`、`cargo fmt -- --check`、`git diff --check`：通过。
- `npm run desktop:build`：Windows x64 EXE、MSI、NSIS 均生成。
- Release 空状态桌面回归：窗口高度 `163px`，`登录 3R` 按钮可见，测试通过。
- macOS 云构建尚待 GitHub Actions 运行；未宣称 macOS 实机验收、签名或公证。
