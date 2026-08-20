# 第 01 号票据验收

本票据只交付本地模拟额度悬浮窗，不会登录 3R，也不会读取任何浏览器会话。

## Windows 验收步骤

1. 双击 `src-tauri/target/debug/three_r_waterline.exe`。
2. 确认桌面上只显示一个无标题栏的圆形水瓶，左侧为绿色周额度、右侧为蓝色月额度；窗口为 256 × 256 逻辑像素，瓶身直径为 240px，不显示外框或信息卡。
3. 确认瓶内“周”、金额、上限和重置倒计时均为同样的粗体字号；周额度显示 `$326.54 /$400`、月额度显示 `$800.57 /$1,600`。
4. 确认金额、上限和倒计时均在瓶内完整显示，没有裁切、滚动条或换行；当只有一个可用订阅时，确认没有翻页箭头，也不会显示无效或不支持的卡片；多个可用订阅时，靠近圆瓶才会显示翻页箭头。
5. 在首次启动仍显示“正在校验额度”时，确认圆瓶内同时出现“登录 3R”按钮；点击它，确认打开的是程序自己的官方登录窗口。登录后回到悬浮窗，确认额度来自订阅页而不是预览数据。
6. 关闭程序后重新启动，确认程序不会读取 Chrome、Edge、Safari 或其他浏览器的登录状态；没有有效的程序内 Login State 时只显示“尚未登录 3R”。
7. Windows 调试程序路径：`src-tauri/target/debug/three_r_waterline.exe`；安装包路径：`src-tauri/target/debug/bundle/msi/3R Waterline_0.1.0_x64_en-US.msi` 与 `src-tauri/target/debug/bundle/nsis/3R Waterline_0.1.0_x64-setup.exe`。

## 本票据未包含的功能

- 开机首次读取、5 分钟最小刷新间隔、睡眠恢复刷新
- Auto-start、Edge Hide、系统菜单、右键设置和 Clear This Device
- macOS 验收与正式签名发布
- 开机首次读取、5 分钟最小刷新间隔、睡眠恢复刷新
- Auto-start、Edge Hide、系统菜单、右键设置和 Clear This Device
- macOS 验收与正式签名发布
