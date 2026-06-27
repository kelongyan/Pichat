import { Trash2, List, Loader2, AlertCircle } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ProviderConfig } from '../types';
import { fetchModels, isImageModel, type ModelInfo } from '../lib/settingsUtils';
import styles from './Settings.module.css';

interface ProviderCardProps {
  provider: ProviderConfig;
  isDefault: boolean;
  isTesting: boolean;
  onSetDefault: () => void;
  onTest: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<ProviderConfig>) => void;
  canRemove: boolean;
}

export function ProviderCard({
  provider,
  isDefault,
  isTesting,
  onSetDefault,
  onTest,
  onRemove,
  onUpdate,
  canRemove,
}: ProviderCardProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [fetched, setFetched] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  // Reset fetched state when baseURL or apiKey changes
  useEffect(() => {
    setFetched(false);
    setModels([]);
  }, [provider.baseURL, provider.apiKey]);

  const handleOpenDropdown = useCallback(async () => {
    if (showDropdown) {
      setShowDropdown(false);
      return;
    }
    if (!provider.baseURL.trim() || !provider.apiKey.trim()) return;
    // Auto-fetch on first open
    if (!fetched) {
      setLoadingModels(true);
      try {
        const list = await fetchModels(provider);
        setModels(list);
        setFetched(true);
        setShowDropdown(list.length > 0);
      } catch {
        setModels([]);
        setFetched(true);
      } finally {
        setLoadingModels(false);
      }
    } else {
      setShowDropdown(models.length > 0);
    }
  }, [provider, fetched, models, showDropdown]);

  const capabilityBadges = provider.capabilities
    ? [
      { label: 'Responses', active: provider.capabilities.responses },
      { label: 'Images', active: provider.capabilities.images },
      { label: 'Stream', active: provider.capabilities.streaming },
      { label: 'Edit', active: provider.capabilities.editing },
    ]
    : [{ label: 'Unverified', active: false }];

  return (
    <div className={`${styles.providerCard}${isDefault ? ` ${styles.providerCardDefault}` : ''}`}>
      <div className={styles.providerTop}>
        <div className={styles.providerInfo}>
          <div className={styles.providerName}>{provider.name || 'Untitled'}</div>
          <div className={styles.providerMeta}>{provider.model} &middot; {provider.protocol || 'responses'}</div>
          <div className={styles.capabilityRow}>
            {capabilityBadges.map((badge) => (
              <span
                key={badge.label}
                className={`${styles.capabilityBadge}${badge.active ? ` ${styles.capabilityBadgeActive}` : ''}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        </div>
        <div className={styles.providerActions}>
          <button className={styles.providerBtn} type="button" disabled={isDefault} onClick={onSetDefault}>
            {isDefault ? 'Default' : 'Set Default'}
          </button>
          <button className={styles.providerBtn} type="button" disabled={isTesting} onClick={onTest}>
            {isTesting ? 'Testing...' : 'Test'}
          </button>
          <button className={styles.iconBtn} type="button" title="Remove" disabled={!canRemove} onClick={onRemove}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className={styles.fields}>
        <div className={styles.fieldsRow}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" type="text" value={provider.name} onChange={(e) => onUpdate({ name: e.target.value })} placeholder="OpenAI" />
          </div>
          <div className="form-group">
            <label className="form-label">Model</label>
            <div className={styles.modelRow} ref={dropdownRef}>
              <input
                className={`form-input ${styles.modelInput}`}
                type="text"
                value={provider.model}
                onChange={(e) => onUpdate({ model: e.target.value })}
                placeholder="gpt-image-2"
              />
              <button
                type="button"
                className={styles.fetchBtn}
                onClick={handleOpenDropdown}
                disabled={!provider.baseURL.trim() || !provider.apiKey.trim()}
                title="Fetch image models"
              >
                {loadingModels ? <Loader2 size={14} className={styles.spin} /> : <List size={14} />}
              </button>
              {showDropdown && models.length > 0 && (
                <div className={styles.modelDropdown}>
                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`${styles.modelOption}${provider.model === m.id ? ` ${styles.modelOptionActive}` : ''}`}
                      onClick={() => { onUpdate({ model: m.id }); setShowDropdown(false); }}
                    >
                      <span className={styles.modelOptionId}>{m.id}</span>
                      {m.owned_by && <span className={styles.modelOptionOwner}>{m.owned_by}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {provider.model && !isImageModel(provider.model) && (
              <div className={styles.modelWarning}>
                <AlertCircle size={12} />
                <span>Not an image model — use gpt-image-2 or dall-e-3</span>
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Protocol</label>
            <select
              className={`form-input ${styles.protocolSelect}`}
              value={provider.protocol || 'responses'}
              onChange={(e) => onUpdate({ protocol: e.target.value as 'responses' | 'images' })}
            >
              <option value="responses">Responses API</option>
              <option value="images">Images API</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Base URL</label>
          <input className="form-input" type="url" value={provider.baseURL} onChange={(e) => onUpdate({ baseURL: e.target.value })} placeholder="https://api.openai.com/v1" />
        </div>
        <div className="form-group">
          <label className="form-label">API Key</label>
          <input className="form-input" type="password" value={provider.apiKey} onChange={(e) => onUpdate({ apiKey: e.target.value })} placeholder="sk-..." />
        </div>
      </div>
    </div>
  );
}
