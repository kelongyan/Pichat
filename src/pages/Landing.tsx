import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { InputBar } from '../components/InputBar';
import type { SendData } from '../components/InputBar';
import { useConfigStore } from '../lib/store';
import styles from './Landing.module.css';

const TITLE_EN = 'Paint your imagination into eternity';

export default function Landing() {
  const navigate = useNavigate();
  const config = useConfigStore((s) => s.config);
  const providers = config?.providers || [];
  const providerId = config?.defaultProviderId || providers[0]?.id || '';

  function handleSend(data: SendData) {
    navigate('/chat', {
      state: {
        prompt: data.prompt,
        generationPrompt: data.generationPrompt,
        size: data.size,
        providerId: data.providerId || providerId,
        images: data.images,
        autoSend: true,
      },
    });
  }

  return (
    <>
      <Header activeTab="create" />
      <div className={`${styles.landing} fade-in`}>
        <div className={styles.titleContainer}>
          <div className={styles.titleDecorLine}></div>
          <div className={styles.titleTextWrapper}>
            <span className={styles.titleEn}>
              {TITLE_EN.split('').map((char, i) => (
                <span
                  key={i}
                  className={styles.charEn}
                  style={{ animationDelay: `${i * 0.03}s` }}
                >
                  {char === ' ' ? ' ' : char}
                </span>
              ))}
            </span>
          </div>
          <div className={styles.titleDecorLine}></div>
        </div>
        <div className={styles.inputWrapper}>
          <InputBar
            placeholder="Describe the image you want..."
            onSend={handleSend}
            providerId={providerId}
          />
        </div>
      </div>
    </>
  );
}
