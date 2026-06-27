# RULE.md

本文件记录 Pichat 项目的关键协作规则，避免后续开发时误判项目边界或 provider 行为。

## 项目定位

- Pichat 是纯前端 React/Vite 应用，没有后端服务。
- API 配置、会话、图片、图库元数据都保存在浏览器本地。
- 生图服务商是 **OpenAI-compatible provider**，不等同于 OpenAI 官方接口。
- 不能假设第三方 provider 完全遵循 OpenAI 官方行为；必须兼容网关差异。

## 第三方 Provider 规则

- Base URL 可能是裸域名，也可能需要 `/v1`。
  - 示例：`https://api.example.com` 可能实际 API 是 `https://api.example.com/v1`。
  - 不能把裸域名返回的 HTML `200` 当作 API 成功。
- 第三方 provider 可能出现：
  - `/models` 可用，但 `/responses` 不可用。
  - `/images/generations` 可用，但不支持参考图编辑。
  - `responses` 非流式可用，但 SSE 流式不可用或被代理缓冲。
  - 返回 `b64_json`、`url`、`result`、`image_base64` 等不同字段。
  - `401/403` 表示 key、额度、权限、分组限制，不应直接当作协议不支持。

## 生图协议原则

- 默认优先 Responses API，因为它支持历史、流式和参考图编辑。
- Images API 是兼容降级协议，不支持真实参考图编辑。
- 只要请求里有参考图，必须走支持 editing 的协议。
- 不允许把带参考图的编辑请求降级成 Images API 的“文字假参考”。
- 流式请求如果 provider 返回 JSON，应按非流式结果处理，而不是按空 SSE 失败。
- 自动 fallback 必须保守：
  - 可以 fallback：HTML 页面响应、明确 endpoint missing、非编辑请求的协议不匹配。
  - 不应 fallback：`401`、`403`、带参考图的 `edit` 请求。

## 配置与安全

- API Key 不要写入文档、测试、提交记录或日志。
- 用户如果把 key 贴到聊天里，应提醒其轮换 key。
- localStorage 中保存 key 是纯前端架构限制；导出数据时应考虑脱敏选项。
- 运行时自动修正 provider 配置要谨慎，最好只在确认成功后写回。
- Provider 可以记录 `capabilities`（Responses / Images / Stream / Edit / auth / reachable）作为探测结果。
- 生成时应通过 planner 产出协议尝试顺序，而不是在请求失败处分散写临时 fallback 逻辑。

## 当前关键文件

- `src/lib/api.ts`：统一 API 请求、错误分类、重试、协议 fallback。
- `src/lib/baseUrl.ts`：Base URL 规范化、`/v1` 候选、HTML/JSON 判断。
- `src/lib/generationStrategy.ts`：生图 planner 与 fallback 策略。
- `src/lib/providerCapabilities.ts`：provider 能力探测结果的构造与本地配置归一化。
- `src/lib/protocols/responses.ts`：Responses API payload 和 SSE 解析。
- `src/lib/protocols/images.ts`：Images API 降级适配。
- `src/lib/settingsUtils.ts`：provider 校验、连接探测、模型拉取。
- `src/lib/imageSource.ts`：base64/data URL/http URL 图片源解析。
- `src/lib/imageStore.ts`：IndexedDB 图片 Blob/缩略图存储。
- `src/pages/useChatGeneration.ts`：聊天生成业务流程。
- `src/pages/generationPersistence.ts`：生成结果本地保存 fallback。

## 验证命令

项目没有配置 `npm test` 或 lint 脚本。

主要验证命令：

```powershell
npm run build
```

可直接运行的相关单测：

```powershell
node --test tests\generationResponse.test.ts tests\generationPersistence.test.ts tests\imageSource.test.ts tests\generationStrategy.test.ts tests\settingsUtils.test.ts
```

注意：部分既有测试直接用 `node --test` 跑时会受 extensionless import 影响；不要误判为业务逻辑失败。

## 开发约束

- 优先保持现有 React + TypeScript + Zustand + CSS Modules 架构。
- 不随意新增依赖。
- 不把第三方 provider 问题简单归因于模型 id。
- 修生图问题时先看：
  1. Base URL 是否需要 `/v1`
  2. provider 是否真的支持 Responses
  3. provider 是否支持 SSE 流式
  4. provider 是否支持参考图编辑
  5. 返回结果是 base64 还是 URL
  6. 本地 IndexedDB/thumbnail 保存是否失败
- 修改 `GPT2IMAGE.md`、`public/assets/system-prompt.md`、`src/lib/api.ts` 的 system prompt fallback 时，需要保持三处同步。
