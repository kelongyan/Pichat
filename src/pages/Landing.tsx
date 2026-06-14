import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { InputBar } from '../components/InputBar';
import type { SendData } from '../components/InputBar';
import { useConfigStore } from '../lib/store';

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
      <div className="landing fade-in">
        <img src="assets/OpenAI.png" alt="Pichat" className="landing-logo" />
        <h1 className="landing-title">What would you like to create?</h1>
        <p className="landing-subtitle">Describe any image and bring it to life</p>
        <div className="landing-input">
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
