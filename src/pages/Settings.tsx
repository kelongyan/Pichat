import { useRef, useState } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Database, Download, FileText, Plus, Settings as SettingsIcon, Trash2, Upload, ArrowLeft, Server, Sliders, PieChart } from 'lucide-react';
import { useToast } from '../components/Toast';
import { ProviderCard } from './ProviderCard';
import { generateId, useConfigStore } from '../lib/store';
import { downloadJsonFile, exportPichatData, importPichatData, type PichatExportData } from '../lib/dataTransfer';
import { loadCustomPromptTemplates, saveCustomPromptTemplates, type PromptTemplate } from '../lib/promptTemplates';
import { loadProviderStats, summarizeProviderStats, type ProviderStatsSummary } from '../lib/providerStats';
import { sanitizeProvider, validateProvider, testProviderConnection } from '../lib/settingsUtils';
import { getSystemPromptVersion, preloadSystemPrompt } from '../lib/api';
import type { Config, ProviderConfig } from '../types';
import { ConnectView } from './ConnectView';
import styles from './Settings.module.css';

const GITHUB_URL = 'https://github.com/kelongyan/Pichat';

const NAV_ITEMS = [
  { id: 'providers', label: 'Providers', icon: Server },
  { id: 'general', label: 'General', icon: Sliders },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'stats', label: 'Stats', icon: PieChart },
] as const;

type NavId = typeof NAV_ITEMS[number]['id'];

function GithubIcon({ size = 24 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}

function createProvider(name = 'New Provider'): ProviderConfig {
  const now = Date.now();
  return {
    id: generateId(),
    name,
    baseURL: '',
    apiKey: '',
    model: 'gpt-image-2',
    createdAt: now,
    updatedAt: now,
  };
}

export default function Settings() {
  const config = useConfigStore((s) => s.config);
  if (!config) return <ConnectView />;
  return <FullSettings config={config} />;
}

function FullSettings({ config }: { config: Config }) {
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const saveConfig = useConfigStore((s) => s.save);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [activeNav, setActiveNav] = useState<NavId>('providers');
  const [providers, setProviders] = useState<ProviderConfig[]>(() =>
    config.providers.length ? config.providers : [createProvider('Default')]
  );
  const [defaultProviderId, setDefaultProviderId] = useState(config.defaultProviderId || config.providers[0]?.id || '');
  const [useSystemPrompt, setUseSystemPrompt] = useState(config.useSystemPrompt !== false);
  const [testingId, setTestingId] = useState('');
  const [templates, setTemplates] = useState<PromptTemplate[]>(() => loadCustomPromptTemplates());
  const [providerStats, setProviderStats] = useState<ProviderStatsSummary[]>(() => summarizeProviderStats(loadProviderStats()));
  const [promptVersion, setPromptVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await preloadSystemPrompt();
      if (!cancelled) setPromptVersion(getSystemPromptVersion());
    })();
    return () => { cancelled = true; };
  }, []);

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
      if (data.config) { setProviders(data.config.providers); setDefaultProviderId(data.config.defaultProviderId); setUseSystemPrompt(data.config.useSystemPrompt !== false); }
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
      const result = await testProviderConnection(sanitized);
      const patch: Partial<ProviderConfig> = {};
      if (result.protocol !== (provider.protocol || 'responses')) {
        patch.protocol = result.protocol;
      }
      if (result.baseURL !== sanitized.baseURL) {
        patch.baseURL = result.baseURL;
      }
      patch.capabilities = result.capabilities;
      if (Object.keys(patch).length > 0) {
        updateProvider(provider.id, patch);
      }
      const authNote = result.authOk ? '' : ' (auth failed — check API key)';
      showToast(`${sanitized.name} connected — ${result.protocol} protocol${authNote}`, { type: result.authOk ? 'success' : 'error' });
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
    saveConfig({ providers: sanitized, defaultProviderId: defaultId, darkMode: config.darkMode ?? false, useSystemPrompt });
    setProviders(sanitized);
    setDefaultProviderId(defaultId);
    showToast('Settings saved', { type: 'success' });
    void runHealthCheck(sanitized.find((p) => p.id === defaultId)!);
  }

  async function runHealthCheck(provider: ProviderConfig) {
    try {
      const result = await testProviderConnection(provider);
      setProviders((prev) => {
        const updated = prev.map((p) => (
          p.id === provider.id
            ? { ...p, protocol: result.protocol, baseURL: result.baseURL, capabilities: result.capabilities }
            : p
        ));
        saveConfig({ providers: updated.map(sanitizeProvider), defaultProviderId: defaultProviderId, darkMode: config.darkMode ?? false, useSystemPrompt });
        return updated;
      });
      showToast(`${provider.name} looks healthy`, { type: 'success' });
    } catch {
      showToast(`${provider.name} did not respond — check API key and base URL`, { type: 'error' });
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <button className={styles.backBtn} type="button" onClick={() => navigate('/create')}>
          <ArrowLeft size={18} />
        </button>
        <h2 className={styles.pageTitle}>Settings</h2>
        <div className={styles.spacer} />
      </div>

      <div className={styles.pageLayout}>
        {/* 左侧导航 */}
        <nav className={styles.sidebar}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`${styles.navItem}${activeNav === item.id ? ` ${styles.navItemActive}` : ''}`}
                onClick={() => setActiveNav(item.id)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 右侧内容 */}
        <main className={styles.content}>
          {/* Providers */}
          {activeNav === 'providers' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Providers</h3>
              <p className={styles.sectionDesc}>Configure your AI image generation providers</p>
              <div className={styles.providerList}>
                {providers.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    isDefault={provider.id === defaultProviderId}
                    isTesting={testingId === provider.id}
                    canRemove={providers.length > 1}
                    onSetDefault={() => setDefaultProviderId(provider.id)}
                    onTest={() => handleTestProvider(provider)}
                    onRemove={() => handleRemoveProvider(provider.id)}
                    onUpdate={(patch) => updateProvider(provider.id, patch)}
                  />
                ))}
              </div>
              <button className={styles.addBtn} type="button" onClick={handleAddProvider}>
                <Plus size={16} /> Add Provider
              </button>
            </div>
          )}

          {/* General */}
          {activeNav === 'general' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>General</h3>
              <p className={styles.sectionDesc}>Configure general application preferences</p>
              <div className={styles.settingCard}>
                <div className={styles.settingRow}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>System prompt</span>
                    <span className={styles.settingDesc}>
                      Inject personality and style instructions
                      {promptVersion && <span className={styles.metaTag}>v{promptVersion}</span>}
                    </span>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={useSystemPrompt} onChange={(e) => setUseSystemPrompt(e.target.checked)} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Data */}
          {activeNav === 'data' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Data</h3>
              <p className={styles.sectionDesc}>Export or import your Pichat data</p>
              <div className={styles.settingCard}>
                <div className={styles.dataActions}>
                  <button className={styles.dataBtn} type="button" onClick={handleExportData}>
                    <Download size={18} />
                    <div>
                      <span className={styles.dataBtnTitle}>Export</span>
                      <span className={styles.dataBtnDesc}>Download all conversations and settings</span>
                    </div>
                  </button>
                  <button className={styles.dataBtn} type="button" onClick={() => importInputRef.current?.click()}>
                    <Upload size={18} />
                    <div>
                      <span className={styles.dataBtnTitle}>Import</span>
                      <span className={styles.dataBtnDesc}>Restore from a Pichat export file</span>
                    </div>
                  </button>
                </div>
                <input ref={importInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={handleImportFile} />
              </div>
            </div>
          )}

          {/* Templates */}
          {activeNav === 'templates' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Templates</h3>
              <p className={styles.sectionDesc}>Manage your prompt templates for quick access</p>
              <div className={styles.templateList}>
                {templates.map((template) => (
                  <div key={template.id} className={styles.templateCard}>
                    <div className={styles.templateHeader}>
                      <FileText size={14} />
                      <input className="form-input" value={template.name} onChange={(e) => updateTemplate(template.id, { name: e.target.value })} placeholder="Template name" />
                      <button className={styles.iconBtn} type="button" title="Remove" onClick={() => handleRemoveTemplate(template.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <textarea className={`form-input ${styles.textarea}`} value={template.template} onChange={(e) => updateTemplate(template.id, { template: e.target.value })} placeholder="Use {prompt} for user input" rows={2} />
                  </div>
                ))}
              </div>
              <div className={styles.actionRow}>
                <button className={styles.actionBtn} type="button" onClick={handleAddTemplate}>
                  <Plus size={16} /> Add
                </button>
                <button className={styles.actionBtn} type="button" onClick={handleSaveTemplates}>
                  <FileText size={16} /> Save
                </button>
              </div>
            </div>
          )}

          {/* Stats */}
          {activeNav === 'stats' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Stats</h3>
              <p className={styles.sectionDesc}>View provider performance statistics</p>
              <div className={styles.settingCard}>
                {providerStats.length === 0 ? (
                  <div className={styles.statsEmpty}>No generation stats yet</div>
                ) : (
                  <div className={styles.statsList}>
                    {providerStats.map((stat) => (
                      <div key={stat.providerId} className={styles.statCard}>
                        <div className={styles.statInfo}>
                          <span className={styles.statName}>{stat.providerName || stat.providerId}</span>
                          <span className={styles.statModel}>{stat.model || 'Unknown'}</span>
                        </div>
                        <div className={styles.statMetrics}>
                          <span>{Math.round(stat.successRate * 100)}% success</span>
                          <span>{stat.avgDurationMs}ms avg</span>
                          <span>{stat.total} runs</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button className={styles.actionBtn} type="button" onClick={refreshProviderStats} style={{ marginTop: 12 }}>
                  <BarChart3 size={16} /> Refresh
                </button>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className={styles.saveRow}>
            <button className={`btn-primary ${styles.saveBtn}`} onClick={handleSave}>
              Save Settings
            </button>
          </div>
        </main>
      </div>

      <div className={styles.pageFooter}>
        <a className={styles.footerLink} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          <GithubIcon size={16} /> GitHub
        </a>
      </div>
    </div>
  );
}
