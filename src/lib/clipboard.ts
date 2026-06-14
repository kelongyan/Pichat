import type { ToastContextValue } from '../components/Toast';

/**
 * Copies text to clipboard and shows a toast notification.
 * @param text - The text to copy
 * @param toast - Toast context for showing notifications
 */
export async function copyToClipboard(text: string, toast: ToastContextValue): Promise<void> {
  try {
    if (!navigator.clipboard) {
      throw new Error('Clipboard API unavailable');
    }
    await navigator.clipboard.writeText(text);
    toast.show('Copied', { type: 'success' });
  } catch {
    toast.show('Unable to copy', { type: 'error' });
  }
}
