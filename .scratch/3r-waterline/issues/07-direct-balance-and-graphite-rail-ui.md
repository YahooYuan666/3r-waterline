# 07 - 直充余额与 Graphite Rail 视觉刷新

**Status:** resolved

**执行方式:** current Codex + OpenAI；Windows-native；连续执行，不交接。

## 范围

- 从官方 `/auth/me` 的认证返回中提取唯一的可用余额字段，作为 `Grok 直充余额` 可翻页项。
- 重做悬浮窗与设置界面视觉；保留所有业务交互、刷新节奏和安全边界。

## 验收

- 见 [design-direct-balance-ui.md](../design-direct-balance-ui.md)。

## 实施计划

1. 扩展原生 capture 与前端归一化，覆盖余额有效、缺失和无效的安全分支。
2. 将余额项融入现有订阅选择，按水瓶/Traffic 两种模式进行无进度展示。
3. 以 Graphite Rail 重写视觉令牌和两种模式的版式，不修改交互回调。
4. 运行单元、构建、原生回归与 Windows release 验证。

## Answer

- 直充余额已作为独立可翻页项纳入；不把它误作周/月额度。
- UI 已改为 Graphite Rail，普通 Traffic 保持两条轨道、余额则是一条独立信息轨。
- 代码检查和 release 打包通过。原生自动化回归因用户正在运行的安装版占用单实例而未执行，详见 `execution-report.md`。
