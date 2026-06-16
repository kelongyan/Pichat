import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './Toast.module.css';

export type ToastType = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  show: boolean;
}

interface ToastOptions {
  type?: ToastType;
  duration?: number;
}

export interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, number[]>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((ids) => {
        if (ids[0] !== undefined) cancelAnimationFrame(ids[0]);
        for (let i = 1; i < ids.length; i++) clearTimeout(ids[i]);
      });
      timers.clear();
    };
  }, []);

  const show = useCallback((message: string, options: ToastOptions = {}) => {
    const { type = 'info', duration = 4000 } = options;
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type, show: false }]);

    const raf = requestAnimationFrame(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, show: true } : t)),
      );
    });

    const hideTimer = window.setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, show: false } : t)),
      );
      const removeTimer = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, 300);
      timersRef.current.set(id, [raf, hideTimer, removeTimer]);
    }, duration);

    timersRef.current.set(id, [raf, hideTimer]);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const icons: Record<ToastType, string> = {
    info: 'i',
    success: '\u2713',
    error: '!',
  };

  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${styles.toast} ${t.type === 'success' ? styles.success : t.type === 'error' ? styles.error : ''}${t.show ? ` ${styles.show}` : ''}`}
        >
          <span className={styles.icon} aria-hidden="true">{icons[t.type]}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
