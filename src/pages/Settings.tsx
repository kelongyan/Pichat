import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, X } from 'lucide-react';
function GithubIcon({ size = 24 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}
import { Header } from '../components/Header';
import { useToast } from '../components/Toast';
import { generateId, useConfigStore } from '../lib/store';
import type { Config, ProviderConfig } from '../types';

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
  const resp = await fetch(`${provider.baseURL.trim().replace(/\/+$/, '')}/models`, {
    headers: { Authorization: `Bearer ${provider.apiKey.trim()}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok && resp.status !== 404) {
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

    if (!b || !k) {
      showToast('Please fill in all required fields', { type: 'error' });
      return;
    }
    if (!isValidHttpUrl(b)) {
      showToast('Please enter a valid HTTP(S) API Base URL', { type: 'error' });
      return;
    }

    setConnecting(true);
    try {
      const now = Date.now();
      const provider: ProviderConfig = {
        id: generateId(),
        name: n,
        baseURL: b,
        apiKey: k,
        model: m,
        createdAt: now,
        updatedAt: now,
      };
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
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="settings-github"
        title="GitHub"
      >
        <GithubIcon size={22} />
      </a>
      <div className="view-centered fade-in">
        <div className="settings-view" style={{ width: '100%', padding: '0 20px' }}>
          <img
            src="assets/OpenAI.png"
            alt="Pichat"
            style={{
              width: 60,
              height: 60,
              objectFit: 'contain',
              marginBottom: 30,
            }}
          />
          <h2 className="settings-title">Configure Pichat</h2>
          <p className="settings-subtitle">
            Connect to an OpenAI-compatible API endpoint
          </p>
          <form onSubmit={handleSubmit} style={{ width: '100%' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="provider-name">
                Provider Name
              </label>
              <input
                className="form-input"
                id="provider-name"
                type="text"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="OpenAI"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="base-url">
                API Base URL
              </label>
              <input
                className="form-input"
                id="base-url"
                type="url"
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
                placeholder="https://api.openai.com/v1"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="api-key">
                API Key
              </label>
              <input
                className="form-input"
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="model">
                Model
              </label>
              <input
                className="form-input"
                id="model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-5.4"
              />
            </div>
            <button
              className="btn-primary"
              type="submit"
              disabled={connecting}
            >
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

  const [providers, setProviders] = useState<ProviderConfig[]>(
    config.providers.length ? config.providers : [createProvider('Default')],
  );
  const [defaultProviderId, setDefaultProviderId] = useState(
    config.defaultProviderId || config.providers[0]?.id || '',
  );
  const [showThinking, setShowThinking] = useState(!!config.showThinking);
  const [useSystemPrompt, setUseSystemPrompt] = useState(config.useSystemPrompt !== false);
  const [testingId, setTestingId] = useState('');

  function updateProvider(id: string, patch: Partial<ProviderConfig>) {
    setProviders((items) => items.map((provider) => (
      provider.id === id ? { ...provider, ...patch } : provider
    )));
  }

  function handleAddProvider() {
    const provider = createProvider(`Provider ${providers.length + 1}`);
    setProviders((items) => [...items, provider]);
    if (!defaultProviderId) setDefaultProviderId(provider.id);
  }

  function handleRemoveProvider(id: string) {
    if (providers.length <= 1) {
      showToast('At least one provider is required', { type: 'error' });
      return;
    }
    const nextProviders = providers.filter((provider) => provider.id !== id);
    setProviders(nextProviders);
    if (defaultProviderId === id) {
      setDefaultProviderId(nextProviders[0].id);
    }
  }

  async function handleTestProvider(provider: ProviderConfig) {
    const sanitized = sanitizeProvider(provider);
    const error = validateProvider(sanitized);
    if (error) {
      showToast(error, { type: 'error' });
      return;
    }
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
    const sanitizedProviders = providers.map(sanitizeProvider);
    for (const provider of sanitizedProviders) {
      const error = validateProvider(provider);
      if (error) {
        showToast(error, { type: 'error' });
        return;
      }
    }
    const defaultId = sanitizedProviders.some((provider) => provider.id === defaultProviderId)
      ? defaultProviderId
      : sanitizedProviders[0].id;
    saveConfig({
      providers: sanitizedProviders,
      defaultProviderId: defaultId,
      showThinking,
      thinkingLevel: config.thinkingLevel || 'low',
      darkMode: config.darkMode ?? false,
      useSystemPrompt,
    });
    setProviders(sanitizedProviders);
    setDefaultProviderId(defaultId);
    showToast('Settings saved', { type: 'success' });
  }

  return (
    <>
      <Header activeTab="" />
      <div className="settings-full fade-in">
        <div className="settings-full-header">
          <h2 className="settings-full-title">Settings</h2>
          <button
            className="settings-close-btn"
            type="button"
            title="Close settings"
            aria-label="Close settings"
            onClick={() => navigate(-1)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">PROVIDERS</div>
          <div className="provider-list">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className={`provider-card${provider.id === defaultProviderId ? ' default' : ''}`}
              >
                <div className="provider-card-header">
                  <div>
                    <div className="provider-card-title">{provider.name || 'Untitled Provider'}</div>
                    <div className="provider-card-meta">{provider.model || 'gpt-5.4'}</div>
                  </div>
                  <div className="provider-card-actions">
                    <button
                      className="provider-action-btn"
                      type="button"
                      disabled={provider.id === defaultProviderId}
                      onClick={() => setDefaultProviderId(provider.id)}
                    >
                      {provider.id === defaultProviderId ? 'Default' : 'Set Default'}
                    </button>
                    <button
                      className="provider-action-btn"
                      type="button"
                      disabled={testingId === provider.id}
                      onClick={() => handleTestProvider(provider)}
                    >
                      {testingId === provider.id ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      className="provider-icon-btn"
                      type="button"
                      title="Remove provider"
                      disabled={providers.length <= 1}
                      onClick={() => handleRemoveProvider(provider.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="provider-fields">
                  <div className="form-group">
                    <label className="form-label" htmlFor={`provider-name-${provider.id}`}>
                      Provider Name
                    </label>
                    <input
                      className="form-input"
                      id={`provider-name-${provider.id}`}
                      type="text"
                      value={provider.name}
                      onChange={(e) => updateProvider(provider.id, { name: e.target.value })}
                      placeholder="OpenAI"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor={`base-url-${provider.id}`}>
                      API Base URL
                    </label>
                    <input
                      className="form-input"
                      id={`base-url-${provider.id}`}
                      type="url"
                      value={provider.baseURL}
                      onChange={(e) => updateProvider(provider.id, { baseURL: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor={`api-key-${provider.id}`}>
                      API Key
                    </label>
                    <input
                      className="form-input"
                      id={`api-key-${provider.id}`}
                      type="password"
                      value={provider.apiKey}
                      onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                      placeholder="sk-..."
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor={`model-${provider.id}`}>
                      Model
                    </label>
                    <input
                      className="form-input"
                      id={`model-${provider.id}`}
                      type="text"
                      value={provider.model}
                      onChange={(e) => updateProvider(provider.id, { model: e.target.value })}
                      placeholder="gpt-5.4"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            className="settings-secondary-btn"
            type="button"
            onClick={handleAddProvider}
          >
            <Plus size={16} /> <span>Add Provider</span>
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">PREFERENCES</div>
          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <span className="settings-toggle-name">Show thinking process</span>
              <span className="settings-toggle-desc">
                Display model reasoning in a collapsible block
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={showThinking}
                onChange={(e) => setShowThinking(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <span className="settings-toggle-name">System prompt</span>
              <span className="settings-toggle-desc">
                Inject full personality and style instructions. When off, only model metadata is sent.
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={useSystemPrompt}
                onChange={(e) => setUseSystemPrompt(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        <button
          className="btn-primary"
          style={{ marginTop: 12 }}
          onClick={handleSave}
        >
          Save
        </button>

        <div className="settings-footer">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="settings-footer-link"
          >
            <GithubIcon size={16} /> <span>GitHub</span>
          </a>
        </div>
      </div>
    </>
  );
}
