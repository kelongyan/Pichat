import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GENERATION_PREFERENCES,
  loadGenerationPreferences,
  normalizeGenerationPreferences,
  saveGenerationPreferences,
  resolveStudioUseCaseAspectDefault,
} from '../src/lib/generationPreferences.ts';

test('resolveStudioUseCaseAspectDefault keeps explicit ratios when a studio mode changes', () => {
  assert.equal(resolveStudioUseCaseAspectDefault('wide', 'poster'), 'wide');
  assert.equal(resolveStudioUseCaseAspectDefault('custom', 'wallpaper'), 'custom');
  assert.equal(resolveStudioUseCaseAspectDefault('auto', 'wallpaper'), '16:9');
});

test('normalizeGenerationPreferences fills safe defaults', () => {
  const normalized = normalizeGenerationPreferences({
    aspect: 'wide',
    resolution: '4k',
    customW: ' 3840 ',
    customH: ' 2560 ',
    studio: {
      useCase: 'wallpaper',
      style: 'cinematic',
      shot: 'wide',
      composition: 'wide',
      tone: 'dramatic',
      material: 'glass',
    },
  });

  assert.equal(normalized.aspect, 'wide');
  assert.equal(normalized.resolution, '4k');
  assert.equal(normalized.customW, '3840');
  assert.equal(normalized.customH, '2560');
  assert.equal(normalized.studio.useCase, 'wallpaper');
});

test('normalizeGenerationPreferences falls back to defaults for invalid values', () => {
  const normalized = normalizeGenerationPreferences({
    aspect: '12:34',
    resolution: 'bad',
    customW: '',
    customH: null,
    studio: {
      useCase: 'unknown',
      style: 'unknown',
      shot: 'unknown',
      composition: 'unknown',
      tone: 'unknown',
      material: 'unknown',
    },
  } as never);

  assert.deepEqual(normalized, DEFAULT_GENERATION_PREFERENCES);
});

test('saveGenerationPreferences and loadGenerationPreferences round trip cleanly', () => {
  const globalScope = globalThis as typeof globalThis & {
    window?: {
      localStorage: {
        getItem: (key: string) => string | null;
        setItem: (key: string, value: string) => void;
        removeItem: (key: string) => void;
      };
    };
  };
  const previousWindow = globalScope.window;
  const storage = new Map<string, string>();

  globalScope.window = {
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => { storage.set(key, value); },
      removeItem: (key) => { storage.delete(key); },
    },
  };

  try {
    saveGenerationPreferences({
      aspect: 'wide',
      resolution: '4k',
      customW: ' 3840 ',
      customH: ' 2560 ',
      studio: {
        useCase: 'wallpaper',
        style: 'cinematic',
        shot: 'wide',
        composition: 'wide',
        tone: 'dramatic',
        material: 'glass',
      },
    });

    assert.deepEqual(loadGenerationPreferences(), {
      aspect: 'wide',
      resolution: '4k',
      customW: '3840',
      customH: '2560',
      studio: {
        useCase: 'wallpaper',
        style: 'cinematic',
        shot: 'wide',
        composition: 'wide',
        tone: 'dramatic',
        material: 'glass',
      },
    });
  } finally {
    if (previousWindow === undefined) {
      delete globalScope.window;
    } else {
      globalScope.window = previousWindow;
    }
  }
});
