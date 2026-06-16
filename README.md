# Pichat

Pichat 是一个纯前端的 AI 对话生图应用。它可以连接任意 OpenAI 兼容的 Responses API，通过自然语言对话生成图片、编辑图片，并在浏览器本地保存创作历史。

- 纯前端：无需自建后端，配置和数据保存在浏览器本地
- 对话生图：保留上下文，支持连续追问与迭代修改
- 图片参考：上传参考图，引导模型编辑或重绘
- 多尺寸生成：支持 Auto、常用比例、自定义尺寸与 Std / HD / 2K / 4K 清晰度
- 变体切换：同一轮对话可多次重试并保留不同结果
- 流式生成：SSE 流式返回，生成过程中实时显示计时与进度
- 画廊与历史：集中浏览作品，支持收藏、标签、筛选与对比
- Prompt 模板：可快速套用常用提示词骨架
- 数据导入导出：可备份本地配置、会话、图片与元数据
- Provider 统计：可查看各模型的成功率与耗时概览
- 多 Provider：可配置多个服务商并切换默认
- 明暗主题：内置浅色 / 深色主题切换

## 技术栈

- React 19
- TypeScript 6
- Vite 8
- Zustand
- react-router-dom HashRouter
- react-markdown + remark-math + rehype-katex
- IndexedDB

## 快速开始

```powershell
npm install
npm run dev
```

启动后打开终端显示的本地地址，在设置页填写：

1. API Base URL，例如 `https://api.openai.com/v1`
2. API Key
3. Model，例如 `gpt-image-2`

保存后即可开始生成图片。

## 可用命令

```powershell
npm run dev
```

启动 Vite 开发服务器。

```powershell
npm run build
```

运行 TypeScript 构建检查并打包生产产物。

```powershell
npm run preview
```

预览生产构建结果。

当前项目没有配置测试命令或 lint 命令，`npm run build` 是主要验证入口。

## API 说明

Pichat 支持两种协议，可在每个 Provider 的设置中切换：

- **Responses API**（默认，`POST /responses`）：支持流式、对话历史和参考图编辑。请求中使用 `image_generation` tool，只要服务商兼容该接口即可使用。
- **Images API**（`POST /images/generations`）：不支持流式、对话历史和参考图编辑；对话历史和参考图会被降级拼接进 prompt。

只要服务商兼容对应接口，就可以在设置页填入对应的 Base URL 和 API Key 使用。

注意：这是浏览器端应用。如果 API 服务商不允许浏览器跨域请求，可能会遇到 CORS 错误。遇到这种情况时，需要更换支持浏览器调用的服务商，或自行通过反向代理转发请求。

## 本地数据

Pichat 不提供服务端存储，数据保存在浏览器本地：

**localStorage：**

- `gpt2image_config`：API 配置（providers、默认 Provider、模型、系统提示词开关、明暗主题）
- `pichat_prompt_templates`：自定义 Prompt 模板
- `pichat_gallery_meta`：画廊收藏与标签
- `pichat_provider_stats`：Provider 生成统计

**IndexedDB（数据库 `gpt2image`，v3）：**

- `conversations`：对话记录（按 `id` 索引）
- `images`：生成图片的 Blob 原图与 200px JPEG 缩略图（按 `id` 索引）
- `gallery_images`：画廊索引，带 `timestamp` 和 `conversationId` 两个索引，支持游标分页与按会话查询

清除浏览器站点数据会删除配置、历史对话和图片。

## 项目结构

```text
src/
  App.tsx                 路由与全局 Provider，启动时初始化 store、配置、主题
  main.tsx                应用入口
  types.ts                共享类型（Config / Conversation / Message / Variant 等）
  lib/
    api.ts                API 客户端：协议路由、SSE 流式解析、错误分类与重试
    store.ts              store barrel：统一 re-export 各 store 与初始化函数
    configStore.ts        Config 的 Zustand store（localStorage 持久化）
    conversationStore.ts  Conversation 的 Zustand store（IndexedDB 读写、画廊同步、游标分页）
    db.ts                 IndexedDB 打开、升级（v3）与 v1→v2 自动迁移
    imageStore.ts         图片 Blob 存储、缩略图生成、压缩与缓存读取
    galleryIndex.ts       画廊索引的构建、同步、回填与删除
    galleryMeta.ts        画廊收藏/标签的持久化与筛选
    promptTemplates.ts    自定义 Prompt 模板的持久化
    providerStats.ts      Provider 生成统计的记录与汇总
    imagePresets.ts       比例（auto/1:1/16:9/4:3/宽屏/竖屏/自定义）与清晰度尺寸矩阵
    imageActions.ts       变体操作（同款/换风格/换背景/改比例/写实/插画等）的 prompt 构建
    dataTransfer.ts       整站数据导入 / 导出（含图片重映射）
    settingsUtils.ts      Provider 字段的校验、规范化与连接测试
    theme.ts              明暗主题切换（带圆形扩散动画）
    markdown.tsx          Markdown 与数学公式渲染
    protocols/
      router.ts           根据 provider.protocol 选择协议适配器
      responses.ts        Responses API 适配器（流式 / 历史 / 编辑）
      images.ts           Images API 适配器（降级处理）
  pages/
    Landing.tsx           创建入口（首页输入框）
    Chat.tsx              对话生图（核心页面）
    MessageBubble.tsx     助手消息气泡（变体切换、重试、操作）
    StreamBubble.tsx      流式生成中的占位气泡（requestAnimationFrame 轮询）
    chatUtils.ts          Chat 页面的纯函数工具（变体解析、参考图、计时格式化）
    Gallery.tsx           图片画廊（筛选 / 收藏 / 标签 / 对比）
    History.tsx           对话历史
    Settings.tsx          API 与偏好设置（多 Provider、模板、统计、导入导出）
    ProviderCard.tsx      单个 Provider 的编辑卡片
    ConnectView.tsx       未配置时的设置引导页
  components/
    Header.tsx            顶部导航与主题切换
    InputBar.tsx          输入栏与图片附件、比例/清晰度设置
    ImageCard.tsx         图片卡片与操作（编辑/全屏/操作菜单）
    Lightbox.tsx          全屏预览
    Toast.tsx             通知提示
    EmptyState.tsx        空状态占位
  hooks/
    useLazyImage.ts       基于 IntersectionObserver 的懒加载图片
  styles/
    tokens.css            设计变量（颜色、字体等）
    globals.css           全局样式
    reset.css             样式重置
    utilities.css         通用工具类
```

页面与组件样式采用 CSS Modules（如 `Chat.module.css`），与上述源文件同名同目录。

## 系统提示词

项目根目录的 `GPT2IMAGE.md` 是系统提示词源文件，运行时实际加载的是：

```text
public/assets/system-prompt.md
```

两者内容保持同步。`api.ts` 中的 `MINIMAL_PROMPT` 是系统提示词关闭（`Config.useSystemPrompt === false`）时的精简回退版本。如果修改系统提示词，请保持这三个位置一致。

## 构建

```powershell
npm run build
```

构建产物会输出到 `dist/`，可部署到任意静态托管服务。项目使用 HashRouter，因此不需要额外配置服务端路由重写。
