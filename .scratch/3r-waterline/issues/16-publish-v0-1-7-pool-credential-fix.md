# 16 - 发布 v0.1.7：号池凭据存储修复

**Type:** task
**Status:** resolved

## 范围

- 修复最多只能保存两个 Google 账号的问题：第三个账号浏览器提示登录成功，但账号不出现，且悬浮窗报 `Attribute 'password' encoded as UTF-16' is longer than platform limit of 2560 chars`。
- 号池查询在账号之间加入 1–5 秒随机间隔。
- 递增版本为 `v0.1.7` 重新发布，不覆盖 v0.1.6 历史资产。

## 根因

旧实现把每个账号的 access_token 一并持久化到系统钥匙串。Windows 凭据上限为 2560 字符，单个 access_token 约 1300 字符，两个账号即写满，第三个写入失败；而 OAuth 回调页已完成并打印「登录成功」，于是出现两侧状态不一致的现象。

## 修复

- 仅持久化 refresh_token，access_token 改为进程内缓存，按需用 refresh_token 重新获取。
- 旧格式凭据可正常反序列化，其中的 access_token 通过 `skip_serializing` 在回写时被丢弃。
- 移除账号或退出全部账号时同步清理内存缓存。

## 验收

- 新增回归测试：10 个账号的号池序列化后小于 2560 字符且不含 access_token 字段。
- 新增回归测试：账号间随机间隔恒定落在 1000–5000 毫秒。
- 新增回归测试：旧格式凭据可读入且不再回写 token。
- 测试：前端 64 项通过，Rust 库 14 项通过。

## Answer

- 公开 Release：<https://github.com/YahooYuan666/3r-waterline/releases/tag/v0.1.7>
- 对应提交：`4976277 chore: release v0.1.7 with pool credential storage fix`
- 关键修复提交：`3852bc5 fix: stop persisting access tokens so a pool can hold more than two accounts`
- macOS 工作流：<https://github.com/YahooYuan666/3r-waterline/actions/runs/38049203961>

## Comments

- 打包期间曾临时移除 HKCU Run 下的 `3R Waterline` 自启动项以解除 exe 文件占用，构建完成后已恢复原值。