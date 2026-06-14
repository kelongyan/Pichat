import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Trash2 } from 'lucide-react';
import { Header } from '../components/Header';
import { useConversationStore } from '../lib/store';
import { getThumbURL, toImageDataUrl } from '../lib/imageStore';
import type { Conversation, Message } from '../types';

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
    if (msg.imageBase64) return { imageBase64: msg.imageBase64 };
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
  const [src, setSrc] = useState(() =>
    info.imageBase64 ? toImageDataUrl(info.imageBase64) : ''
  );

  useEffect(() => {
    if (info.imageId) {
      getThumbURL(info.imageId).then((url) => { if (url) setSrc(url); });
    }
  }, [info.imageId]);

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

  async function handleDelete(e: React.MouseEvent, conv: Conversation) {
    e.stopPropagation();
    await remove(conv.id);
  }

  const items = conversations.filter((c) => c.messages.some((m) => m.role === 'user'));

  return (
    <>
      <Header activeTab="history" />
      {loaded && items.length === 0 && (
        <div className="landing fade-in">
          <div style={{ color: 'var(--text-muted)', fontSize: 48, marginBottom: 16 }}>
            <Clock size={48} strokeWidth={1} />
          </div>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>No conversations yet</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            Start creating to build your history
          </p>
        </div>
      )}
      {loaded && items.length > 0 && (
        <div className="history-list fade-in">
          {items.map((conv) => {
            const firstUser = conv.messages.find((m) => m.role === 'user');
            if (!firstUser) return null;
            const thumbInfo = findFirstImage(conv.messages);
            return (
              <div
                key={conv.id}
                className="history-item"
                onClick={() => navigate('/chat', { state: { conversationId: conv.id } })}
              >
                <div className="history-thumb">
                  {thumbInfo && <ThumbImage info={thumbInfo} />}
                </div>
                <div className="history-text">
                  <div className="history-prompt">{firstUser.text}</div>
                  <div className="history-time">{formatTime(conv.createdAt)}</div>
                </div>
                <button
                  className="history-delete"
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
