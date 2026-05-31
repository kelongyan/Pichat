export type WaterfallMode = 'standard' | 'matrix';

export interface ExplorationSeed {
  id: string;
  label: string;
  style: string;
  composition: string;
  mood: string;
}

export const EXPLORATION_SEEDS: ExplorationSeed[] = [
  {
    id: 'cinematic-close',
    label: 'Film Close',
    style: 'cinematic lighting with shallow depth of field',
    composition: 'close subject framing with strong foreground focus',
    mood: 'dramatic but polished',
  },
  {
    id: 'editorial-wide',
    label: 'Editorial Wide',
    style: 'editorial art direction with refined details',
    composition: 'wide composition with clear environmental storytelling',
    mood: 'quiet and premium',
  },
  {
    id: 'minimal-clean',
    label: 'Minimal Clean',
    style: 'minimal visual language and restrained detail',
    composition: 'centered subject with strong negative space',
    mood: 'clean and calm',
  },
  {
    id: 'dreamy-soft',
    label: 'Dreamy Soft',
    style: 'soft atmospheric rendering',
    composition: 'gentle layered depth with a clear focal point',
    mood: 'dreamy and luminous',
  },
  {
    id: 'product-polish',
    label: 'Product Polish',
    style: 'commercial polish with controlled highlights',
    composition: 'readable silhouette and refined studio presentation',
    mood: 'premium and tactile',
  },
  {
    id: 'poster-bold',
    label: 'Poster Bold',
    style: 'bold poster-ready art direction',
    composition: 'graphic hierarchy with strong subject shape',
    mood: 'confident and memorable',
  },
  {
    id: 'worldbuilding',
    label: 'Worldbuild',
    style: 'rich concept-art detail',
    composition: 'immersive scene with layered background elements',
    mood: 'expansive and story-driven',
  },
  {
    id: 'texture-study',
    label: 'Texture Study',
    style: 'visible material texture and surface detail',
    composition: 'balanced framing that emphasizes tactile qualities',
    mood: 'crafted and intimate',
  },
];

export function getExplorationSeed(index: number): ExplorationSeed {
  return EXPLORATION_SEEDS[((index % EXPLORATION_SEEDS.length) + EXPLORATION_SEEDS.length) % EXPLORATION_SEEDS.length];
}

export function buildWaterfallPrompt(prompt: string, mode: WaterfallMode, index: number): string {
  const trimmed = prompt.trim();
  if (mode === 'standard') return trimmed;
  const seed = getExplorationSeed(index);
  return `${trimmed}\n\nExploration direction:\n- Style: ${seed.style}.\n- Composition: ${seed.composition}.\n- Mood: ${seed.mood}.`;
}

export function orderWaterfallCards<T extends { pinned?: boolean }>(cards: T[]): T[] {
  return [
    ...cards.filter((card) => card.pinned),
    ...cards.filter((card) => !card.pinned),
  ];
}
