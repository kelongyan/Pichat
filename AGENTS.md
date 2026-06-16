# AGENTS.md

## Commands
- `npm install` — this repo has `package-lock.json` and no alternate package manager config
- `npm run dev` — starts Vite dev server
- `npm run build` — primary verification step: runs `tsc -b` then `vite build`
- `npm run preview` — serves production build
- No test, lint, or formatter scripts configured; do not invent `npm test` or `npm run lint`

## App Shape
- Pure frontend React app; no backend. Runtime API settings and user data live in browser (IndexedDB + localStorage).
- Uses `HashRouter` in `src/App.tsx` — static hosting needs no server-side route rewrites.
- `initStore()` must complete before `imageStore` APIs work; `src/App.tsx` calls it in a `useEffect` before `loadConfig()` and `applyTheme()`.
- Routes: `/create` (Landing entry), `/chat` (Chat), `/gallery` (Gallery), `/history` (History), `/settings` (Settings). `/create`, `/chat`, `/gallery`, `/history` are guarded by `RequireConfig` and redirect to `/settings` when no provider is configured. `Settings` renders `ConnectView` as a setup wizard when `config` is null.
- Main pages: `Landing.tsx` (hero input → navigates to `/chat` with `autoSend`), `Chat.tsx` (conversational generation), `Gallery.tsx` and `History.tsx` (persisted browsing), `Settings.tsx` (API config).

## API Layer
- `src/lib/api.ts` posts to `${provider.baseURL}${adapter.getEndpoint()}` (trailing slashes stripped). Handles error classification (CORS/auth/rate-limit), 120s timeout, auto-retry (max 2, exponential backoff) for non-streaming requests only.
- Protocol selection is per-provider via `provider.protocol` (`'responses'` default or `'images'`), routed in `src/lib/protocols/router.ts`. The Images adapter (`protocols/images.ts`) does NOT support streaming/history/editing — history is concatenated into the prompt and reference images are noted but ignored.
- `protocols/responses.ts` builds Responses API payloads, parses JSON/SSE deltas. Default model `'gpt-image-2'` is applied here when `provider.model` is empty.
- `generateImage()` defaults `action: 'auto'`; **callers must pass `action: 'edit'` when `images[]` is non-empty** or the API ignores reference images. `Chat.tsx` enforces this.
- Passing `onStream` callback enables streaming and disables retry logic (`maxAttempts = 1`).
- Size `'auto'` is intentionally omitted from the tool payload in `protocols/responses.ts`.
- `Config.useSystemPrompt === false` uses the embedded `MINIMAL_PROMPT` in `api.ts`; otherwise runtime fetches `public/assets/system-prompt.md`.

## Storage
- Config: `localStorage["gpt2image_config"]` (read/written via `src/lib/configStore.ts` Zustand store, with legacy single-provider normalization).
- Prompt templates: `localStorage["pichat_prompt_templates"]` (`lib/promptTemplates.ts`).
- Gallery favorites/tags: `localStorage["pichat_gallery_meta"]` (`lib/galleryMeta.ts`).
- Provider stats: `localStorage["pichat_provider_stats"]` (`lib/providerStats.ts`).
- Conversations: IndexedDB `gpt2image` database (v3), object store `conversations`.
- Images: IndexedDB object store `images` (Blob + 200px JPEG thumbnail).
- Gallery index: IndexedDB object store `gallery_images` (`lib/db.ts`), with `timestamp` and `conversationId` indexes for cursor pagination and per-conversation queries. Rebuilt from conversations via `syncGalleryForConversation()` on every `conversationStore.save()`; backfilled on first load via `ensureGalleryIndexBackfilled()`.
- `src/lib/db.ts` owns DB open/upgrade and migration: v1→v2 migration (localStorage conversations → IndexedDB, inline base64 → Blob via `saveImage`). Runs automatically on first load inside `initStore()`.
- `src/lib/store.ts` is now a **barrel that re-exports** `generateId`, `initStore`, `useConfigStore`, `useConversationStore`, `ensureGalleryIndexBackfilled` — migration logic lives in `db.ts`, not here.
- `Message.variants[]` holds multiple generations; `Message.imageBase64` and `Message.size` are deprecated v1 fields for compat only.
- `deleteImage(id)` removes from DB **and** revokes blob URLs from both `urlCache` and `thumbCache` — use it instead of raw DB delete to avoid memory leaks.
- `revokeAll()` releases all cached blob URLs — call on unmount in gallery-like pages.
- `compressImage()` caps uploaded reference images at 2048px before sending to API.

## Chat Streaming Pattern
- `Chat.tsx` uses a mutable `streamRef` (not state) to accumulate SSE deltas.
- Separate `StreamBubble` component polls via `requestAnimationFrame` — avoids re-rendering full message list on every delta.
- Completed messages committed to `conversation` state and IndexedDB only after stream ends.

## UI and Design
- Styling uses **CSS Modules** (`*.module.css` colocated with each page/component) plus global CSS in `src/styles/` (`tokens.css`, `globals.css`, `reset.css`, `utilities.css`); no Tailwind/PostCSS.
- Claude-inspired aesthetic: warm neutrals, serif typography (Libre Baskerville + Noto Serif SC; Inter for UI), editorial pacing. See `DESIGN.md` for full design system.
- Fonts loaded from Google Fonts in `index.html`.

## System Prompt
- Keep `GPT2IMAGE.md` (repo root) and `public/assets/system-prompt.md` (runtime asset) and `src/lib/api.ts` (MINIMAL_PROMPT fallback) synchronized when editing.
