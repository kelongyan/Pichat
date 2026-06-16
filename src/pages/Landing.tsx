import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { InputBar } from '../components/InputBar';
import type { SendData } from '../components/InputBar';
import { useConfigStore } from '../lib/store';
import styles from './Landing.module.css';

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
        <img src="assets/logo.png" alt="Pichat" className={styles.logo} />
        <h1 className={styles.heroTitle}>What would you like to create?</h1>
        <p className={styles.subtitle}>Describe any image and bring it to life</p>
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
