# 校园智能助手 HarmonyOS 源码工程

工程采用 Stage 模式，当前构建 profile 对齐 DevEco Studio 26.0.0 / HarmonyOS 26.0.0 SDK。包含根与 entry Hvigor 配置、ArkUI 四主页面、校园五场景、本地 Preferences、HTTP/SSE、离线合成业务校验、CSV 文件选择/解析、通知/日程提醒与桌面卡片源码。

环境复核：在工作区根目录执行 `pwsh -NoProfile -File src/mobile/inspect-environment.ps1`。脚本读取实际管理器配置和协议状态，并运行hdc、模拟器管理器的版本/目标/实例/已下载镜像只读命令；原始退出码和输出保存到 `audit/client/`。执行成功与设备就绪分别记录，协议未接受、空实例或空目标都不能视为设备验证通过。

从此目录导入真实 DevEco Studio，或从工作区根目录执行 `src/mobile/build-local.ps1 -DevEcoHome 'D:\DevEco Studio'`。脚本在新的 ASCII 副本逐文件校验哈希，只在副本生成本机插件路径，保存任务解析、编译及打包完整日志。2026-10-15 当前源码已生成未签名 HAP/APP，实际实体见 `artifacts/client/hap/20261015T192452/`；签名要求、安装及运行仍须由实际模拟器确认。按 `docs/client/device-verification-checklist.md` 留存设备证据，统一启动见 `docs/LOCAL_DEMO.md`。

业务均为合成演示。默认离线，个人页可配置本地 API；真实设备的回环地址指设备本身，访问 PC 的方案尚未验证。个人 CSV 只在本机保存；五列顺序为 title,kind,location,startsAt,endsAt，kind=course/exam，ISO 时间含时区，256 KB / 500 条。ICS 暂不支持。Papa Parse 和 Lucide 图标附原许可，未公开发布。

完整说明及实际 Web/纯业务验证结果：D:\华为ICT\docs\client\README.md、D:\华为ICT\audit\client\latest_client.md。纯业务的 Node 执行不是鸿蒙编译、通知、卡片或真机证据。
