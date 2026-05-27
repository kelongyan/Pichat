# AGENTS.md

## Commands
- Install with `npm install`; this repo has `package-lock.json` and no alternate package manager config.
- `npm run dev` starts the Vite dev server.
- `npm run build` is the primary verification step: it runs `tsc -b` and then `vite build`.
- `npm run preview` serves the production build.
- No test, lint, or formatter scripts are configured; do not invent `npm test` or `npm run lint` as required checks.

## App Shape
- Pure frontend React app; no backend code in this repo. Runtime API settings and user data live in the browser.
- Routing uses `HashRouter` in `src/App.tsx`, so static hosting should not need server route rewrites.
- `src/App.tsx` calls `initStore()` before loading config/theme; `imageStore` APIs depend on that IndexedDB setup.
- Main pages are in `src/pages`: `Chat.tsx` for conversational generation, `Waterfall.tsx` for batch generation, `Gallery.tsx` and `History.tsx` for persisted browsing.

## API Gotchas
- `src/lib/api.ts` posts to `${config.baseURL}/responses` after stripping trailing slashes.
- `generateImage()` defaults `action` to `'auto'`; callers sending reference `images[]` must pass `action: 'edit'` or compatible APIs may ignore the reference images.
- Passing `onStream` enables streaming and disables retry logic (`maxAttempts = 1`); retries only apply to non-streaming requests.
- Size `'auto'` is intentionally omitted from the `image_generation` tool payload.
- `Config.useSystemPrompt === false` uses the embedded `MINIMAL_PROMPT`; otherwise runtime fetches `public/assets/system-prompt.md`.

## Storage Gotchas
- Config is stored in `localStorage["gpt2image_config"]`; conversations/images are in IndexedDB database `gpt2image`.
- `src/lib/store.ts` includes legacy migration from localStorage conversations and v1 base64 image fields into Blob-backed variants.
- New assistant image results should be stored as `variants[]`; `Message.imageBase64` and `Message.size` are legacy compatibility fields only.
- Use `deleteImage(id)` when removing images so object URLs are revoked; call `revokeAll()` on gallery-like page unmounts to clear cached Blob URLs.
- `compressImage()` caps uploaded reference images at 2048px before API use.

## UI And Prompt Conventions
- Styling is vanilla CSS in `src/styles/globals.css`; no Tailwind/PostCSS setup exists.
- Preserve the warm parchment/editorial design system; see `DESIGN.md` for details when changing UI.
- If editing the system prompt, keep `GPT2IMAGE.md` and `public/assets/system-prompt.md` synchronized.
