# Pichat

Pichat 是一个纯前端的 AI 对话生图应用。它可以连接任意 OpenAI 兼容的 Responses API，通过自然语言对话生成图片、编辑图片，并在浏览器本地保存创作历史。

- 纯前端：无需自建后端，配置和数据保存在浏览器本地
- 对话生图：保留上下文，支持连续追问与迭代修改
- 图片参考：上传参考图，引导模型编辑或重绘
- 多尺寸生成：支持 Auto、常用比例、2K / 4K 等尺寸选项
- 变体切换：同一轮对话可多次重试并保留不同结果
- 画廊与历史：集中浏览作品，回到任意历史对话
- 瀑布流模式：适合批量生成和连续探索
- Thinking 显示：可选展示模型推理摘要
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
3. Model，例如 `gpt-5.4`

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

Pichat 调用 OpenAI 兼容的 Responses API：

```text
POST /responses
```

请求中会使用 `image_generation` tool。只要服务商兼容该接口，就可以在设置页填入对应的 Base URL 和 API Key 使用。

注意：这是浏览器端应用。如果 API 服务商不允许浏览器跨域请求，可能会遇到 CORS 错误。遇到这种情况时，需要更换支持浏览器调用的服务商，或自行通过反向代理转发请求。

## 本地数据

Pichat 不提供服务端存储，数据保存在浏览器本地：

- `localStorage["gpt2image_config"]`：保存 API Base URL、API Key、模型和偏好设置
- IndexedDB `gpt2image`：保存对话、生成图片 Blob 和缩略图

清除浏览器站点数据会删除配置、历史对话和图片。

## 项目结构

```text
src/
  App.tsx                 路由与全局 Provider
  main.tsx                应用入口
  types.ts                共享类型
  lib/
    api.ts                Responses API 客户端、SSE 流式解析、错误分类
    store.ts              Zustand store 与 IndexedDB 迁移
    imageStore.ts         图片 Blob 存储、缩略图、压缩与读取
    theme.ts              明暗主题切换
    markdown.tsx          Markdown 与数学公式渲染
  pages/
    Landing.tsx           创建入口
    Chat.tsx              对话生图
    Gallery.tsx           图片画廊
    History.tsx           对话历史
    Waterfall.tsx         瀑布流批量生成
    Settings.tsx          API 与偏好设置
  components/
    Header.tsx            顶部导航
    InputBar.tsx          输入栏与图片附件
    ImageCard.tsx         图片卡片操作
    Lightbox.tsx          全屏预览
    Toast.tsx             通知提示
    WarningPopup.tsx      确认弹窗
  styles/
    globals.css           全局样式与设计变量
```

## 系统提示词

项目根目录的 `GPT2IMAGE.md` 是系统提示词源文件，运行时实际加载的是：

```text
public/assets/system-prompt.md
```

如果修改系统提示词，请保持这两个文件同步。

## 构建

```powershell
npm run build
```

构建产物会输出到 `dist/`，可部署到任意静态托管服务。项目使用 HashRouter，因此不需要额外配置服务端路由重写。
