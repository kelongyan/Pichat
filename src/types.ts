export interface Config {
  providers: ProviderConfig[];
  defaultProviderId: string;
  showThinking: boolean;
  thinkingLevel: ThinkingLevel;
  darkMode: boolean;
  useSystemPrompt: boolean;
}

export type ThinkingLevel = 'low' | 'medium' | 'high' | 'xhigh';

export type Protocol = 'responses' | 'images';

export interface ProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  protocol?: Protocol;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: string;
  createdAt: number;
  messages: Message[];
}

export interface Message {
  role: 'user' | 'assistant';
  text?: string;
  generationPrompt?: string;
  imageDataUrls?: string[];
  imageDataUrl?: string;
  variants?: Variant[];
  activeVariant?: number;
  error?: string;
  timestamp: number;
  /** @deprecated Legacy field from v1 — use variants[] instead */
  imageBase64?: string;
  /** @deprecated Legacy field from v1 — use variants[].size instead */
  size?: string;
}

export interface Variant {
  text?: string;
  imageBase64?: string;
  imageId?: string;
  thinking?: string;
  providerId?: string;
  providerName?: string;
  model?: string;
  size: string;
  timestamp: number;
}

export interface GalleryImage {
  id?: string;
  imageId?: string;
  imageBase64?: string;
  size: string;
  prompt: string;
  conversationId: string;
  providerId?: string;
  providerName?: string;
  model?: string;
  timestamp: number;
}

export interface StreamDelta {
  text: string | null;
  thinking: string | null;
  imageBase64: string | null;
  done?: boolean;
}

export interface GenerateImageParams {
  prompt: string;
  size?: string;
  action?: string;
  images?: string[];
  thinking?: string;
  providerId?: string;
  onStream?: (delta: StreamDelta) => void;
  history?: Message[];
  signal?: AbortSignal;
}

export interface GenerateImageResult {
  text: string | null;
  imageBase64: string | null;
  thinking: string | null;
  raw: unknown;
}

export interface BuildPayloadParams {
  provider: ProviderConfig;
  prompt: string;
  size: string;
  action: string;
  images: string[];
  thinking?: string;
  history: Message[];
  instructions: string;
  stream: boolean;
}

export interface ProtocolAdapter {
  buildPayload(params: BuildPayloadParams): unknown;
  parseResponse(response: Response): Promise<GenerateImageResult>;
  readStream?(response: Response, onStream: (delta: StreamDelta) => void): Promise<GenerateImageResult>;
  getEndpoint(): string;
  supportsStreaming: boolean;
  supportsHistory: boolean;
  supportsThinking: boolean;
  supportsEditing: boolean;
}
