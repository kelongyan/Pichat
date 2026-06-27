import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { generateId, useConfigStore } from '../lib/store';
import { isValidHttpUrl, testProviderConnection } from '../lib/settingsUtils';
import type { ProviderConfig } from '../types';
import styles from './Settings.module.css';

function GithubIcon({ size = 24 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}

const GITHUB_URL = 'https://github.com/kelongyan/Pichat';

export function ConnectView() {
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const saveConfig = useConfigStore((s) => s.save);

  const [providerName, setProviderName] = useState('Default');
  const [baseURL, setBaseURL] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-image-2');
  const [connecting, setConnecting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const b = baseURL.trim();
    const k = apiKey.trim();
    const m = model.trim() || 'gpt-image-2';
    const n = providerName.trim() || 'Default';

    if (!b || !k) { showToast('Please fill in all required fields', { type: 'error' }); return; }
    if (!isValidHttpUrl(b)) { showToast('Please enter a valid HTTP(S) API Base URL', { type: 'error' }); return; }

    setConnecting(true);
    try {
      const now = Date.now();
      const provider: ProviderConfig = { id: generateId(), name: n, baseURL: b, apiKey: k, model: m, createdAt: now, updatedAt: now };
      const testResult = await testProviderConnection(provider);
      provider.protocol = testResult.protocol;
      provider.baseURL = testResult.baseURL;
      provider.capabilities = testResult.capabilities;
      saveConfig({
        providers: [provider],
        defaultProviderId: provider.id,
        darkMode: document.documentElement.getAttribute('data-theme') === 'dark',
        useSystemPrompt: true,
      });
      if (!testResult.authOk) {
        showToast('Connected — but API key authentication failed. Please verify your API key.', { type: 'error' });
      } else {
        showToast(`Connected successfully (${testResult.protocol} protocol)`, { type: 'success' });
      }
      navigate('/create');
    } catch {
      showToast('Connection failed — settings were not saved', { type: 'error' });
    } finally {
      setConnecting(false);
    }
  }

  return (
    <>
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={styles.github} title="GitHub">
        <GithubIcon size={22} />
      </a>
      <div className="view-centered fade-in">
        <div className={styles.view}>
          <img src="assets/logo.png" alt="Pichat" className={styles.logo} />
          <h2 className={styles.title}>Configure Pichat</h2>
          <p className={styles.subtitle}>Connect to an OpenAI-compatible API endpoint</p>
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
              <input className="form-input" id="model" type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-image-2" />
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
