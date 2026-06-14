import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Download, FileText, Plus, Trash2, Upload, X, ArrowLeft } from 'lucide-react';
function GithubIcon({ size = 24 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}
import { useToast } from '../components/Toast';
import { generateId, useConfigStore } from '../lib/store';
import { downloadJsonFile, exportPichatData, importPichatData, type PichatExportData } from '../lib/dataTransfer';
import { loadCustomPromptTemplates, saveCustomPromptTemplates, type PromptTemplate } from '../lib/promptTemplates';
import { loadProviderStats, summarizeProviderStats, type ProviderStatsSummary } from '../lib/providerStats';
import type { Config, ProviderConfig, Protocol } from '../types';

const GITHUB_URL = 'https://github.com/kelongyan/Pichat';

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function createProvider(name = 'New Provider'): ProviderConfig {
  const now = Date.now();
  return {
    id: generateId(),
    name,
    baseURL: '',
    apiKey: '',
    model: 'gpt-5.4',
    protocol: 'responses',
    createdAt: now,
    updatedAt: now,
  };
}

function sanitizeProvider(provider: ProviderConfig): ProviderConfig {
  return {
    ...provider,
    name: provider.name.trim() || 'Untitled Provider',
    baseURL: provider.baseURL.trim(),
    apiKey: provider.apiKey.trim(),
    model: provider.model.trim() || 'gpt-5.4',
    updatedAt: Date.now(),
  };
}

function validateProvider(provider: ProviderConfig): string | null {
  if (!provider.name.trim()) return 'Provider name is required';
  if (!provider.baseURL.trim() || !provider.apiKey.trim()) return 'Please fill in all provider fields';
  if (!isValidHttpUrl(provider.baseURL.trim())) return 'Please enter a valid HTTP(S) API Base URL';
  return null;
}

async function testProviderConnection(provider: ProviderConfig): Promise<void> {
  const base = provider.baseURL.trim().replace(/\/+$/, '');
  const protocol = provider.protocol || 'responses';
  const endpoint = protocol === 'images' ? '/images/generations' : '/models';
  const resp = await fetch(`${base}${endpoint}`, {
    method: protocol === 'images' ? 'POST' : 'HEAD',
    headers: {
      Authorization: `Bearer ${provider.apiKey.trim()}`,
      ...(protocol === 'images' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: protocol === 'images'
      ? JSON.stringify({ model: provider.model, prompt: 'test', n: 1, response_format: 'b64_json' })
      : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok && !(protocol === 'responses' && resp.status === 404)) {
    throw new Error(`HTTP ${resp.status}`);
  }
}

export default function Settings() {
  const config = useConfigStore((s) => s.config);

  if (!config) {
    return <ConnectView />;
  }
  return <FullSettings config={config} />;
}

function ConnectView() {
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const saveConfig = useConfigStore((s) => s.save);

  const [providerName, setProviderName] = useState('Default');
  const [baseURL, setBaseURL] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-5.4');
  const [connecting, setConnecting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const b = baseURL.trim();
    const k = apiKey.trim();
    const m = model.trim() || 'gpt-5.4';
    const n = providerName.trim() || 'Default';

    if (!b || !k) { showToast('Please fill in all required fields', { type: 'error' }); return; }
    if (!isValidHttpUrl(b)) { showToast('Please enter a valid HTTP(S) API Base URL', { type: 'error' }); return; }

    setConnecting(true);
    try {
      const now = Date.now();
      const provider: ProviderConfig = { id: generateId(), name: n, baseURL: b, apiKey: k, model: m, createdAt: now, updatedAt: now };
      await testProviderConnection(provider);
      saveConfig({
        providers: [provider],
        defaultProviderId: provider.id,
        showThinking: false,
        thinkingLevel: 'low',
        darkMode: document.documentElement.getAttribute('data-theme') === 'dark',
        useSystemPrompt: true,
      });
      showToast('Connected successfully', { type: 'success' });
      navigate('/create');
    } catch {
      showToast('Connection failed — settings were not saved', { type: 'error' });
    } finally {
      setConnecting(false);
    }
  }

  return (
    <>
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="settings-github" title="GitHub">
        <GithubIcon size={22} />
      </a>
      <div className="view-centered fade-in">
        <div className="settings-view">
          <img src="assets/OpenAI.png" alt="Pichat" className="settings-logo" />
          <h2 className="settings-title">Configure Pichat</h2>
          <p className="settings-subtitle">Connect to an OpenAI-compatible API endpoint</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="provider-name">Provider Name</label>
              <input className="form-input" id="provider-name" type="text" value={providerName} onChange={(e) => setProviderName(e.target.value)} placeholder="OpenAI" required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="base-url">API Base URL</label>
              <input className="form-input" id="base-url" type="url" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.openai.com/v1" required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="api-key">API Key</label>
              <input className="form-input" id="api-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="model">Model</label>
              <input className="form-input" id="model" type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-5.4" />
            </div>
            <button className="btn-primary" type="submit" disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

function FullSettings({ config }: { config: Config }) {
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const saveConfig = useConfigStore((s) => s.save);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [providers, setProviders] = useState<ProviderConfig[]>(() =>
    config.providers.length ? config.providers : [createProvider('Default')]
  );
  const [defaultProviderId, setDefaultProviderId] = useState(config.defaultProviderId || config.providers[0]?.id || '');
  const [showThinking, setShowThinking] = useState(!!config.showThinking);
  const [useSystemPrompt, setUseSystemPrompt] = useState(config.useSystemPrompt !== false);
  const [testingId, setTestingId] = useState('');
  const [templates, setTemplates] = useState<PromptTemplate[]>(() => loadCustomPromptTemplates());
  const [providerStats, setProviderStats] = useState<ProviderStatsSummary[]>(() => summarizeProviderStats(loadProviderStats()));

  function updateProvider(id: string, patch: Partial<ProviderConfig>) {
    setProviders((items) => items.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function handleAddProvider() {
    const provider = createProvider(`Provider ${providers.length + 1}`);
    setProviders((items) => [...items, provider]);
    if (!defaultProviderId) setDefaultProviderId(provider.id);
  }

  function updateTemplate(id: string, patch: Partial<PromptTemplate>) {
    setTemplates((items) => items.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)));
  }

  function handleAddTemplate() {
    const now = Date.now();
    setTemplates((items) => [...items, { id: generateId(), name: `Template ${items.length + 1}`, template: '{prompt}, polished composition, refined lighting, no watermark.', createdAt: now, updatedAt: now }]);
  }

  function handleRemoveTemplate(id: string) {
    setTemplates((items) => items.filter((t) => t.id !== id));
  }

  function handleSaveTemplates() {
    saveCustomPromptTemplates(templates);
    setTemplates(loadCustomPromptTemplates());
    showToast('Prompt templates saved', { type: 'success' });
  }

  function refreshProviderStats() {
    setProviderStats(summarizeProviderStats(loadProviderStats()));
  }

  async function handleExportData() {
    try {
      const data = await exportPichatData();
      downloadJsonFile(`pichat-export-${new Date().toISOString().slice(0, 10)}.json`, data);
      showToast('Export file prepared', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed', { type: 'error' });
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!raw || typeof raw !== 'object' || raw.version !== 1) {
        throw new Error('Unsupported Pichat export file');
      }
      if (!Array.isArray(raw.conversations)) {
        throw new Error('Invalid export file: missing conversations');
      }
      if (raw.config && !Array.isArray(raw.config.providers)) {
        throw new Error('Invalid export file: config.providers must be an array');
      }
      const data = raw as PichatExportData;
      await importPichatData(data);
      if (data.config) { setProviders(data.config.providers); setDefaultProviderId(data.config.defaultProviderId); setShowThinking(data.config.showThinking); setUseSystemPrompt(data.config.useSystemPrompt !== false); }
      setTemplates(loadCustomPromptTemplates());
      refreshProviderStats();
      showToast('Import complete', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed', { type: 'error' });
    }
  }

  function handleRemoveProvider(id: string) {
    if (providers.length <= 1) { showToast('At least one provider is required', { type: 'error' }); return; }
    const next = providers.filter((p) => p.id !== id);
    setProviders(next);
    if (defaultProviderId === id) setDefaultProviderId(next[0].id);
  }

  async function handleTestProvider(provider: ProviderConfig) {
    const sanitized = sanitizeProvider(provider);
    const error = validateProvider(sanitized);
    if (error) { showToast(error, { type: 'error' }); return; }
    setTestingId(provider.id);
    try {
      await testProviderConnection(sanitized);
      showToast(`${sanitized.name} connected successfully`, { type: 'success' });
    } catch {
      showToast(`${sanitized.name} connection failed`, { type: 'error' });
    } finally {
      setTestingId('');
    }
  }

  function handleSave() {
    const sanitized = providers.map(sanitizeProvider);
    for (const p of sanitized) { const e = validateProvider(p); if (e) { showToast(e, { type: 'error' }); return; } }
    const defaultId = sanitized.some((p) => p.id === defaultProviderId) ? defaultProviderId : sanitized[0].id;
    saveConfig({ providers: sanitized, defaultProviderId: defaultId, showThinking, thinkingLevel: config.thinkingLevel || 'low', darkMode: config.darkMode ?? false, useSystemPrompt });
    setProviders(sanitized);
    setDefaultProviderId(defaultId);
    showToast('Settings saved', { type: 'success' });
  }

  return (
    <>
      <div className="settings-page">
        <div className="settings-page-header">
          <button className="settings-back-btn" type="button" onClick={() => navigate('/create')}>
            <ArrowLeft size={18} />
          </button>
          <h2 className="settings-page-title">Settings</h2>
          <div className="settings-page-spacer" />
        </div>

        <div className="settings-page-body">
          <div className="settings-card">
            <div className="settings-card-title">Providers</div>
            <div className="provider-list">
              {providers.map((provider) => (
                <div key={provider.id} className={`provider-card${provider.id === defaultProviderId ? ' default' : ''}`}>
                  <div className="provider-card-top">
                    <div className="provider-card-info">
                      <div className="provider-card-name">{provider.name || 'Untitled'}</div>
                      <div className="provider-card-meta">{provider.model} &middot; {provider.protocol || 'responses'}</div>
                    </div>
                    <div className="provider-card-actions">
                      <button className="provider-action-btn" type="button" disabled={provider.id === defaultProviderId} onClick={() => setDefaultProviderId(provider.id)}>
                        {provider.id === defaultProviderId ? 'Default' : 'Set Default'}
                      </button>
                      <button className="provider-action-btn" type="button" disabled={testingId === provider.id} onClick={() => handleTestProvider(provider)}>
                        {testingId === provider.id ? 'Testing...' : 'Test'}
                      </button>
                      <button className="provider-icon-btn" type="button" title="Remove" disabled={providers.length <= 1} onClick={() => handleRemoveProvider(provider.id)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="provider-fields">
                    <div className="provider-fields-row">
                      <div className="form-group">
                        <label className="form-label">Name</label>
                        <input className="form-input" type="text" value={provider.name} onChange={(e) => updateProvider(provider.id, { name: e.target.value })} placeholder="OpenAI" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Model</label>
                        <input className="form-input" type="text" value={provider.model} onChange={(e) => updateProvider(provider.id, { model: e.target.value })} placeholder="gpt-5.4" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Base URL</label>
                      <input className="form-input" type="url" value={provider.baseURL} onChange={(e) => updateProvider(provider.id, { baseURL: e.target.value })} placeholder="https://api.openai.com/v1" />
                    </div>
                    <div className="provider-fields-row">
                      <div className="form-group">
                        <label className="form-label">API Key</label>
                        <input className="form-input" type="password" value={provider.apiKey} onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })} placeholder="sk-..." />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Protocol</label>
                        <div className="protocol-pills">
                          <button
                            type="button"
                            className={`protocol-pill${(provider.protocol || 'responses') === 'responses' ? ' active' : ''}`}
                            onClick={() => updateProvider(provider.id, { protocol: 'responses' })}
                          >
                            Responses
                          </button>
                          <button
                            type="button"
                            className={`protocol-pill${provider.protocol === 'images' ? ' active' : ''}`}
                            onClick={() => updateProvider(provider.id, { protocol: 'images' })}
                          >
                            Images
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="settings-add-btn" type="button" onClick={handleAddProvider}>
              <Plus size={16} /> Add Provider
            </button>
          </div>

          <div className="settings-card">
            <div className="settings-card-title">Preferences</div>
            <div className="settings-toggle-row">
              <div className="settings-toggle-info">
                <span className="settings-toggle-name">Show thinking</span>
                <span className="settings-toggle-desc">Display model reasoning in a collapsible block</span>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={showThinking} onChange={(e) => setShowThinking(e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>
            <div className="settings-toggle-row">
              <div className="settings-toggle-info">
                <span className="settings-toggle-name">System prompt</span>
                <span className="settings-toggle-desc">Inject personality and style instructions</span>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={useSystemPrompt} onChange={(e) => setUseSystemPrompt(e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-title">Data</div>
            <div className="settings-action-row">
              <button className="settings-action-btn" type="button" onClick={handleExportData}>
                <Download size={16} /> Export
              </button>
              <button className="settings-action-btn" type="button" onClick={() => importInputRef.current?.click()}>
                <Upload size={16} /> Import
              </button>
            </div>
            <input ref={importInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={handleImportFile} />
          </div>

          <div className="settings-card">
            <div className="settings-card-title">Prompt Templates</div>
            <div className="template-list">
              {templates.map((template) => (
                <div key={template.id} className="template-card">
                  <div className="template-card-header">
                    <FileText size={14} />
                    <input className="form-input" value={template.name} onChange={(e) => updateTemplate(template.id, { name: e.target.value })} placeholder="Template name" />
                    <button className="provider-icon-btn" type="button" title="Remove" onClick={() => handleRemoveTemplate(template.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <textarea className="form-input template-textarea" value={template.template} onChange={(e) => updateTemplate(template.id, { template: e.target.value })} placeholder="Use {prompt} for user input" rows={2} />
                </div>
              ))}
            </div>
            <div className="settings-action-row">
              <button className="settings-action-btn" type="button" onClick={handleAddTemplate}>
                <Plus size={16} /> Add
              </button>
              <button className="settings-action-btn" type="button" onClick={handleSaveTemplates}>
                <FileText size={16} /> Save
              </button>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-title">Provider Stats</div>
            {providerStats.length === 0 ? (
              <div className="provider-stats-empty">No generation stats yet</div>
            ) : (
              <div className="provider-stats-list">
                {providerStats.map((stat) => (
                  <div key={stat.providerId} className="provider-stat-card">
                    <div className="provider-stat-info">
                      <span className="provider-stat-name">{stat.providerName || stat.providerId}</span>
                      <span className="provider-stat-model">{stat.model || 'Unknown'}</span>
                    </div>
                    <div className="provider-stat-metrics">
                      <span>{Math.round(stat.successRate * 100)}% success</span>
                      <span>{stat.avgDurationMs}ms avg</span>
                      <span>{stat.total} runs</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="settings-action-btn" type="button" onClick={refreshProviderStats} style={{ marginTop: 12 }}>
              <BarChart3 size={16} /> Refresh
            </button>
          </div>

          <button className="btn-primary settings-save-main" onClick={handleSave}>
            Save Settings
          </button>

          <div className="settings-page-footer">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="settings-footer-link">
              <GithubIcon size={16} /> GitHub
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
