import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Trash2 } from 'lucide-react';
import { Header } from '../components/Header';
import { EmptyState } from '../components/EmptyState';
import { useConversationStore } from '../lib/store';
import { toImageDataUrl } from '../lib/imageStore';
import { useLazyImage } from '../hooks/useLazyImage';
import type { Conversation, Message } from '../types';
import styles from './History.module.css';

interface ThumbInfo {
  imageId?: string;
  imageBase64?: string;
}

function findFirstImage(messages: Message[]): ThumbInfo | null {
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    if (msg.variants) {
      for (const v of msg.variants) {
        if (v.imageId) return { imageId: v.imageId };
        if (v.imageBase64) return { imageBase64: v.imageBase64 };
      }
    }
  }
  return null;
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function ThumbImage({ info }: { info: ThumbInfo }) {
  const thumbSrc = useLazyImage(info.imageId, true);
  const base64Src = info.imageBase64 ? toImageDataUrl(info.imageBase64) : '';
  const src = thumbSrc || base64Src;

  if (!src) return null;
  return <img src={src} alt="" />;
}

export default function History() {
  const navigate = useNavigate();
  const loadAll = useConversationStore((s) => s.loadAll);
  const remove = useConversationStore((s) => s.remove);
  const conversations = useConversationStore((s) => s.conversations);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadAll().then(() => setLoaded(true));
  }, [loadAll]);

  const handleDelete = useCallback(async (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    await remove(conv.id);
  }, [remove]);

  const items = useMemo(
    () => conversations.filter((c) => c.messages.some((m) => m.role === 'user')),
    [conversations],
  );

  return (
    <>
      <Header activeTab="history" />
      {loaded && items.length === 0 && (
        <EmptyState
          icon={<Clock size={48} strokeWidth={1} />}
          title="No conversations yet"
          subtitle="Start creating to build your history"
        />
      )}
      {loaded && items.length > 0 && (
        <div className={`${styles.list} fade-in`}>
          {items.map((conv) => {
            const firstUser = conv.messages.find((m) => m.role === 'user');
            if (!firstUser) return null;
            const thumbInfo = findFirstImage(conv.messages);
            return (
              <div
                key={conv.id}
                className={styles.item}
                onClick={() => navigate('/chat', { state: { conversationId: conv.id } })}
              >
                <div className={styles.thumb}>
                  {thumbInfo && <ThumbImage info={thumbInfo} />}
                </div>
                <div className={styles.text}>
                  <div className={styles.prompt}>{firstUser.text}</div>
                  <div className={styles.time}>{formatTime(conv.createdAt)}</div>
                </div>
                <button
                  className={styles.deleteBtn}
                  title="Delete conversation"
                  onClick={(e) => handleDelete(e, conv)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
