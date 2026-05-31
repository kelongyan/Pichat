export const PROMPT_TEMPLATES_STORAGE_KEY = 'pichat_prompt_templates';

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  createdAt: number;
  updatedAt: number;
  builtin?: boolean;
}

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'tpl-product',
    name: 'Product Shot',
    template: 'Premium product photo of {prompt}, clean background, controlled highlights, tactile materials, no watermark.',
    createdAt: 1,
    updatedAt: 1,
    builtin: true,
  },
  {
    id: 'tpl-poster',
    name: 'Poster',
    template: 'Poster-ready image of {prompt}, strong focal point, graphic composition, room for title text if requested.',
    createdAt: 1,
    updatedAt: 1,
    builtin: true,
  },
  {
    id: 'tpl-character',
    name: 'Character',
    template: 'Character design of {prompt}, clear silhouette, expressive pose, consistent details, polished concept art finish.',
    createdAt: 1,
    updatedAt: 1,
    builtin: true,
  },
  {
    id: 'tpl-wallpaper',
    name: 'Wallpaper',
    template: 'Immersive wallpaper of {prompt}, wide composition, atmospheric depth, no text, no watermark.',
    createdAt: 1,
    updatedAt: 1,
    builtin: true,
  },
];

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function createTemplateId(now = Date.now()): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 8);
  return `tpl-${now.toString(36)}-${random}`;
}

export function normalizePromptTemplate(raw: Partial<PromptTemplate>, now = Date.now()): PromptTemplate {
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createTemplateId(now);
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled Template';
  const template = typeof raw.template === 'string' ? raw.template.trim() : '';
  return {
    id,
    name,
    template,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    builtin: raw.builtin === true,
  };
}

export function normalizePromptTemplates(raw: unknown, now = Date.now()): PromptTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizePromptTemplate(item as Partial<PromptTemplate>, now))
    .filter((template) => template.template.length > 0);
}

export function loadPromptTemplates(): PromptTemplate[] {
  if (!canUseStorage()) return DEFAULT_PROMPT_TEMPLATES;
  try {
    const custom = normalizePromptTemplates(JSON.parse(window.localStorage.getItem(PROMPT_TEMPLATES_STORAGE_KEY) || '[]'));
    return [...DEFAULT_PROMPT_TEMPLATES, ...custom];
  } catch {
    return DEFAULT_PROMPT_TEMPLATES;
  }
}

export function loadCustomPromptTemplates(): PromptTemplate[] {
  if (!canUseStorage()) return [];
  try {
    return normalizePromptTemplates(JSON.parse(window.localStorage.getItem(PROMPT_TEMPLATES_STORAGE_KEY) || '[]'));
  } catch {
    return [];
  }
}

export function saveCustomPromptTemplates(templates: PromptTemplate[]): void {
  if (!canUseStorage()) return;
  const custom = normalizePromptTemplates(templates).map((template) => ({ ...template, builtin: false }));
  window.localStorage.setItem(PROMPT_TEMPLATES_STORAGE_KEY, JSON.stringify(custom));
}

export function applyPromptTemplate(prompt: string, template: PromptTemplate | null | undefined): string {
  const trimmed = prompt.trim();
  if (!template || !template.template.trim()) return trimmed;
  const templateText = template.template.trim();
  if (templateText.includes('{prompt}')) {
    return templateText.replace(/\{prompt\}/g, trimmed);
  }
  return `${trimmed}\n\n${templateText}`;
}
