import { Trash2 } from 'lucide-react';
import type { ProviderConfig } from '../types';
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
  return (
    <div className={`${styles.providerCard}${isDefault ? ` ${styles.providerCardDefault}` : ''}`}>
      <div className={styles.providerTop}>
        <div className={styles.providerInfo}>
          <div className={styles.providerName}>{provider.name || 'Untitled'}</div>
          <div className={styles.providerMeta}>{provider.model} &middot; {provider.protocol || 'responses'}</div>
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
            <input className="form-input" type="text" value={provider.model} onChange={(e) => onUpdate({ model: e.target.value })} placeholder="gpt-image-2" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Base URL</label>
          <input className="form-input" type="url" value={provider.baseURL} onChange={(e) => onUpdate({ baseURL: e.target.value })} placeholder="https://api.openai.com/v1" />
        </div>
        <div className={styles.fieldsRow}>
          <div className="form-group">
            <label className="form-label">API Key</label>
            <input className="form-input" type="password" value={provider.apiKey} onChange={(e) => onUpdate({ apiKey: e.target.value })} placeholder="sk-..." />
          </div>
          <div className="form-group">
            <label className="form-label">Protocol</label>
            <div className={styles.pills}>
              <button
                type="button"
                className={`${styles.pill}${(provider.protocol || 'responses') === 'responses' ? ` ${styles.pillActive}` : ''}`}
                onClick={() => onUpdate({ protocol: 'responses' })}
              >
                Responses
              </button>
              <button
                type="button"
                className={`${styles.pill}${provider.protocol === 'images' ? ` ${styles.pillActive}` : ''}`}
                onClick={() => onUpdate({ protocol: 'images' })}
              >
                Images
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
