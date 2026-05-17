# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # TypeScript check + Vite production build
npm run preview  # Preview production build locally
```

No test runner or linter is configured.

## Architecture

GPT2Image is a pure-frontend React SPA that generates images via any OpenAI-compatible API (Responses API with `image_generation` tool). Zero backend — all data lives in the browser (config in localStorage, conversations in IndexedDB).

### Tech Stack

- React 19 + TypeScript + Vite 8
- Zustand for state management
- react-router-dom with HashRouter (hash-based routing)
- react-markdown + remark-math + rehype-katex for rendering assistant text

### Key Modules

- `src/lib/api.ts` — Core API client. Calls `/responses` endpoint with SSE streaming. Handles system prompt injection, conversation history building, and error classification.
- `src/lib/store.ts` — Zustand stores for config (localStorage) and conversations (IndexedDB). Includes legacy migration from localStorage to IndexedDB.
- `src/lib/theme.ts` — Dark/light theme with animated circular clip-path transition.
- `src/types.ts` — All shared TypeScript interfaces (Config, Conversation, Message, Variant, StreamDelta).

### Data Model

Conversations contain Messages. Each assistant Message has a `variants[]` array supporting retry/regeneration with `< 1/N >` navigation. Legacy v1 messages stored `imageBase64` directly on the Message; v2 uses `variants[]`.

### Design System

See `DESIGN.md` for the full design spec. Key points:
- Monochrome black/white palette (GPT-style), warm tones in dark mode
- Serif headings (Libre Baskerville), generous spacing
- Design references Claude/Anthropic aesthetic but uses a simplified warm monochrome variant

### System Prompt

The AI persona prompt lives in `GPT2IMAGE.md` (source of truth) and is served from `public/assets/system-prompt.md` at runtime. The `api.ts` module fetches and caches it, injecting `{{CURRENT_DATE}}` before sending to the API.
