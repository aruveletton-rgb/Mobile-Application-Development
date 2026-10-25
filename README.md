# 移动应用开发 · 校园智能助手

西安交通大学《移动应用开发》课程项目，第 16 组。
项目方向以华为 ICT 大赛（创新赛 · 赛题 1）为主线，本仓库承载其中的**鸿蒙客户端与 Web 演示**。

## 项目内容

通知、课程/考试、报修、失物和活动分散在多个入口。应用以对话承接检索与解释，以结构化页面承接确认与提交，覆盖五个校园场景，报修作为首条办理验证流程。

## 目录结构

```
src/
├── mobile/      HarmonyOS 应用（ArkTS / ArkUI）
└── web-demo/    复用同一服务契约的薄层 Web 演示（Vite + TypeScript）
```

## 功能模块（M1—M6）

| 编号 | 模块 | 说明 |
|---|---|---|
| M1 | ArkUI 应用框架 | 首页 / 对话 / 服务 / 个人四区，页面路由、底部导航、主题适配、公共组件 |
| M2 | 校园对话入口 | 通知、课程/考试、报修、失物、活动查询；消息列表、上下文、历史记录 |
| M3 | 校园服务流程 | 通知聚合、课表/考试日程、报修提交、失物发布、活动报名 |
| M4 | 端云通信与本地数据 | 统一 HTTP 封装、鉴权、错误码、超时；偏好、历史、待办、最近服务 |
| M5 | 鸿蒙触达能力 | 服务卡片（近期日程/待办）、系统通知（考试、报修状态、活动截止） |
| M6 | 测试与交付 | 五场景用例、真机与异常场景、上架材料、演示视频 |

## 统一接口

客户端按同一契约对接后端：

```
POST /api/v1/chat
GET  /api/v1/notices
POST /api/v1/tickets
```

响应保留 `code / message / data / traceId`。后端不可用时，客户端以本地合成适配器降级运行，便于独立演示。

## 环境要求

- DevEco Studio 26.0.0.851（HarmonyOS SDK，API 26）
- Node.js 22+（仅 Web 演示）

## 构建与验证

```powershell
# 鸿蒙构建
pwsh -NoProfile -File src/mobile/build-local.ps1

# Web 演示
cd src/web-demo
npm install
npm run dev
npm test
```

## 当前状态

- HAP 可构建（`entry-default-unsigned.hap` 约 378 KB），五场景走查通过
- Web 演示测试通过
- **原生能力未验证**：系统通知、服务卡片、设备端回执均无真机记录（`hdc list targets` 为空）
- **未签名、未上架**：无发布证书与 Profile，未提交华为应用市场审核

## 数据说明

当前全部为**合成数据**，用于课程原型与开发演示，不代表任何学校真实通知、课程、工单或活动。
真实数据接入须取得校方或业务方授权。

## 许可

见 [LICENSE](LICENSE)。图标资源许可见 `src/mobile/LUCIDE_LICENSE.txt`。
