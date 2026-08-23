# 3R Waterline 当前验收

## Windows 验收步骤

1. 双击 `src-tauri/target/debug/three_r_waterline.exe`。确认没有 CMD 窗口，任务栏不出现主窗口项，系统托盘出现一个“3R 水位”图标。
2. 首次启动确认悬浮窗先显示“正在校验额度”；若无有效 Login State，同时显示“登录 3R”。登录成功后，确认读取的是当前 3R 账户的周和月剩余额度。
3. 右键悬浮窗，确认可以打开“设置、隐藏悬浮窗、退出 3R 水位”。在托盘图标上右键，确认可以使用“显示 3R 水位、设置、退出 3R 水位”。
4. 在“设置”中切换“圆形水瓶”和“Traffic Monitor”，并选择大/中/小界面尺寸。关闭设置后，确认设置标题栏可拖动；Traffic Monitor 只有两条自适应横条，没有滚动条，中/小档文字不加粗且不重叠。标题栏显示当前订阅名，两侧按钮可切换订阅，也可在设置中开启自动切换。
5. 把悬浮窗拖到屏幕左、右、上或下边缘并松开，确认约 250ms 后仅保留清晰可见的 14px 点阵把手；点阵分别反映当前周/月剩余比例。鼠标移入把手后完整悬浮窗恢复，鼠标移开后自动重新贴边；拖动悬浮窗离开边缘后才解除贴边状态。
6. 登录成功后，打开设置确认“开机自动启动”已启用；关闭它后重启程序，确认设置保持关闭。重新启用后，确认系统登录后自动启动程序，并在启动时立即读取最新额度，之后不早于 5 分钟再次请求。
7. 点击“清除本机登录信息”，确认当前额度立即消失、Auto-start 被关闭；重启后确认程序不能展示前一用户的额度，并要求重新登录。
8. 如果网页取消周限额或调整月上限，等待下一次五分钟读取；确认周栏消失、月上限更新，不显示猜测值。对小加油包这类只显示“剩余 N 天（截止日期）”的订阅，确认额度仍显示，若没有可用 reset 文本则只隐藏“后重置”一行。Windows 调试程序路径：`src-tauri/target/debug/three_r_waterline.exe`。本次可交付安装包路径：`src-tauri/target/release/bundle/msi/3R Waterline_0.1.0_x64_en-US.msi` 与 `src-tauri/target/release/bundle/nsis/3R Waterline_0.1.0_x64-setup.exe`。

## 当前限制

- Windows 打包与原生交互已在本机构建验证；macOS 的 Login State、透明悬浮窗和 Auto-start 仍需要在真实 macOS 设备上验收并完成签名/公证。

## 本轮自动证据

- `npm test -- --run`：43 项前端测试通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：4 项服务端归一化测试通过。
- Release `scripts/edge-autohide-check.ps1`：拖到边缘、恢复、离开后自动重贴边三项均通过。
- Release `scripts/desktop-interaction-check.ps1`：单实例、贴边恢复/重触发、设置窗口工作区夹紧、Traffic 切换、菜单消失和二次启动恢复均通过。
