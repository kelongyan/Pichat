import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import styles from './Lightbox.module.css';

interface LightboxState {
  src: string;
  prompt?: string;
}

interface LightboxContextValue {
  open: (src: string, options?: { prompt?: string }) => void;
  close: () => void;
}

const LightboxContext = createContext<LightboxContextValue | null>(null);

export function useLightbox(): LightboxContextValue {
  const ctx = useContext(LightboxContext);
  if (!ctx) throw new Error('useLightbox must be used within LightboxProvider');
  return ctx;
}

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LightboxState | null>(null);

  const open = useCallback((src: string, options?: { prompt?: string }) => {
    setState({ src, prompt: options?.prompt });
  }, []);

  const close = useCallback(() => {
    setState(null);
  }, []);

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, close]);

  return (
    <LightboxContext.Provider value={{ open, close }}>
      {children}
      {state && <Lightbox src={state.src} prompt={state.prompt} onClose={close} />}
    </LightboxContext.Provider>
  );
}

interface LightboxProps {
  src: string;
  prompt?: string;
  onClose: () => void;
}

export function Lightbox({ src, prompt, onClose }: LightboxProps) {
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className={`${styles.lightbox} fade-in`} onClick={handleBackdropClick}>
      <button className={styles.close} onClick={onClose}>
        <X size={20} />
      </button>
      <img src={src} alt={prompt || 'Generated image'} />
      {prompt && <p className={styles.prompt}>{prompt}</p>}
    </div>
  );
}
