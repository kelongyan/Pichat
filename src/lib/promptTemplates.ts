import { canUseStorage } from './storage';

const PROMPT_TEMPLATES_STORAGE_KEY = 'pichat_prompt_templates';

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  createdAt: number;
  updatedAt: number;
  builtin?: boolean;
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

export function saveCustomPromptTemplates(templates: PromptTemplate[]): void {
  if (!canUseStorage()) return;
  const custom = normalizePromptTemplates(templates).map((template) => ({ ...template, builtin: false }));
  try {
    window.localStorage.setItem(PROMPT_TEMPLATES_STORAGE_KEY, JSON.stringify(custom));
  } catch {
    // quota / private mode — ignore write failure
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
