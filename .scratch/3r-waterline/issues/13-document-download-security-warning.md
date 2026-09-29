# 13 - 说明便携版下载后的安全警告

**Type:** task
**Status:** resolved

## 背景

用户从浏览器下载便携版 `three_r_waterline.exe` 到本机任意位置后，每次启动（含开机自启动）都会弹"打开文件 - 安全警告（无法验证发布者）"；同一份构建在本机编译目录下运行则不弹。

## 根因

浏览器下载的文件带有 Windows"来自网络"标记（NTFS `Zone.Identifier` 流，Mark of the Web）；对带该标记且无 Authenticode 签名的 EXE，资源管理器/自启动每次都会弹安全警告。弹窗与文件所在文件夹无关，只与文件本身是否带标记有关。本机编译产物从生成起不带标记。

## 范围

- 在 GitHub Release 说明与 README 中说明警告成因、安装版与便携版的差异、解除锁定步骤。
- 不重新构建资产：NSIS 安装版自 v0.1.3 起已随 Release 提供（由 `release-windows.yml` 构建上传），无需重复构建。
- 根治（可信代码签名）另立事项：候选 SignPath Foundation（开源免费）或 Certum 开源证书（约 €49/年）。

## 验收

- v0.1.4 Release 说明包含"安全提示"章节：成因、SHA256 摘要校验、安装版最多提示一次、便携版解除锁定方法。
- README 包含"下载与安全提示"章节。

## Answer

- v0.1.4 Release 说明已更新：<https://github.com/YahooYuan666/3r-waterline/releases/tag/v0.1.4>
- README 新增"下载与安全提示"章节。
- 关键结论：NSIS 安装版已存在于 Release，安装后运行/自启不再弹窗；便携版用户解除锁定一次即可永久消除；根治需可信代码签名。

## Comments

- 2026-09-29：用户本机 `D:\Program\three_r_waterline.exe`（v0.1.4 便携版）实测带 `Zone.Identifier`，`ReferrerUrl` 指向 GitHub v0.1.4 Release；项目目录内 `target\release` 构建产物无该标记，与根因分析一致。
