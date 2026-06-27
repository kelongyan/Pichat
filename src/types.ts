export interface Config {
  providers: ProviderConfig[];
  defaultProviderId: string;
  darkMode: boolean;
  useSystemPrompt: boolean;
}

export type Protocol = 'responses' | 'images';

export interface ProviderCapabilities {
  responses: boolean;
  images: boolean;
  streaming: boolean;
  editing: boolean;
  authOk: boolean;
  reachable: boolean;
  checkedAt: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  protocol?: Protocol;
  capabilities?: ProviderCapabilities;
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
  providerId?: string;
  providerName?: string;
  model?: string;
  size: string;
  timestamp: number;
  durationMs?: number;
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

export type StreamStage = 'generating' | 'complete';

export interface StreamDelta {
  text: string | null;
  imageBase64: string | null;
  done?: boolean;
  stage?: StreamStage;
}

export interface GenerateImageParams {
  prompt: string;
  size?: string;
  action?: string;
  images?: string[];
  providerId?: string;
  onStream?: (delta: StreamDelta) => void;
  history?: Message[];
  signal?: AbortSignal;
}

export interface GenerateImageResult {
  text: string | null;
  imageSource?: string | null;
  imageBase64: string | null;
  raw: unknown;
}

export interface BuildPayloadParams {
  provider: ProviderConfig;
  prompt: string;
  size: string;
  action: string;
  images: string[];
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
  supportsEditing: boolean;
}
