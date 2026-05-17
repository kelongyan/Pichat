<div align="center">
  <br>
  <h1 align="center">Pichat</h1>
  <p align="center">
    纯前端对话生图应用 — 连接任意 OpenAI 兼容 API，通过自然语言创作图片
  </p>
  <br>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" alt="TypeScript 6">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite 8">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

---

## 功能

| 功能 | 说明 |
|------|------|
| **对话生图** | 描述你想要的画面，在聊天中即时生成 |
| **图片编辑** | 附加参考图进行引导式修改 |
| **瀑布流模式** | 一个 prompt 批量并发生成，滚动自动加载更多 |
| **灵活尺寸** | Auto / 1:1 / 3:2 / 2:3 / 16:9 / 9:16 / 2K / 4K / 自定义 |
| **重试与变体** | 对任意结果重新生成，多次结果以 `< 1/N >` 分支切换 |
| **画廊与历史** | 浏览所有生成图片，回顾过往对话 |
| **全屏灯箱** | 原始分辨率查看，支持下载 |
| **Thinking 模式** | 支持 low / medium / high / xhigh 推理强度 |
| **零后端** | 完全运行在浏览器，数据存储于 IndexedDB |

---

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

打开浏览器访问终端输出的地址，在设置页填入 **API Base URL** 和 **API Key** 即可使用。

### 生产构建

```bash
npm run build
npm run preview
```

---

## 技术栈

- **React 19** + **TypeScript 6** + **Vite 8**
- **Zustand** 状态管理
- **react-router-dom**（HashRouter）
- **react-markdown** + **KaTeX** 数学公式渲染
- **IndexedDB** 图片 Blob 存储 + 自动缩略图生成

---

## API 兼容性

调用 [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses) 的 `image_generation` 工具，支持 SSE 流式输出。任何兼容该接口的端点均可使用。

| 模型 | 尺寸支持 |
|------|---------|
| gpt-4o / gpt-4.1 | 标准尺寸（最大 1792×1024） |
| gpt-5.4 | 标准 + 2K/4K（最大 3840×2160） |

> 设置中的 Model 字段是聊天模型（如 `gpt-5.4`），底层图片模型由 API 自动选择。

---

## 项目结构

```
src/
├── main.tsx                 # 入口
├── App.tsx                  # 路由与全局 Provider
├── types.ts                 # 共享类型定义
├── lib/
│   ├── api.ts               # Responses API 客户端（流式）
│   ├── store.ts             # Zustand store + IndexedDB 持久化
│   ├── imageStore.ts        # 图片 Blob 存储 / 缩略图 / 压缩
│   ├── theme.ts             # 明暗主题切换（圆形动画）
│   ├── markdown.tsx         # Markdown + 数学公式渲染
│   └── filename.ts          # 下载文件名生成
├── pages/
│   ├── Landing.tsx           # 首页
│   ├── Chat.tsx              # 对话生图
│   ├── Waterfall.tsx         # 瀑布流批量生成
│   ├── Gallery.tsx           # 图片画廊（分页加载）
│   ├── History.tsx           # 对话历史
│   └── Settings.tsx          # 设置
├── components/
│   ├── Header.tsx
│   ├── InputBar.tsx          # 输入栏（尺寸/Thinking 选择、图片附件）
│   ├── ImageCard.tsx         # 图片卡片（支持 Blob URL 渲染）
│   ├── Lightbox.tsx          # 全屏灯箱
│   ├── Toast.tsx
│   └── WarningPopup.tsx
└── styles/
    └── globals.css           # 设计变量与全局样式
```

---

## 许可证

MIT
