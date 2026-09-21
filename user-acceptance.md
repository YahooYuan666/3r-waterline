# 用户验收：grok.3rcd.com、去掉直充余额、火绒密线贴边

1. 不要覆盖正在运行的 `D:\Program\three_r_waterline.exe`。用本仓库 `src-tauri/target/release/three_r_waterline.exe` 做便携检验。
2. 登录应对 `https://grok.3rcd.com/`，不再请求 `https://ai.3rcd.com/`。
3. 悬浮窗只显示周/月订阅额度，不能再翻到 `Grok 直充余额`，也不应出现独立可用余额轨。
4. 贴边后把手应像火绒侧栏：14px 深色条、1px 密线铺满、周绿月蓝、组间留白。侧边是横向细线纵向堆叠；上下边是竖向细线横向排列。
5. 便携版复制给其他用户时不应携带原登录状态。
