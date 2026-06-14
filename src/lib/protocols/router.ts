import type { ProviderConfig, ProtocolAdapter } from '../../types';
import { createResponsesAdapter } from './responses';
import { createImagesAdapter } from './images';

export function getProtocolAdapter(provider: ProviderConfig): ProtocolAdapter {
  const protocol = provider.protocol || 'responses';

  switch (protocol) {
    case 'responses':
      return createResponsesAdapter();
    case 'images':
      return createImagesAdapter();
    default:
      console.warn(`Unknown protocol "${protocol}", falling back to responses`);
      return createResponsesAdapter();
  }
}
