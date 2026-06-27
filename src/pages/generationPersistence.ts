interface PersistedGeneratedImage {
  imageId?: string;
  imageBase64?: string;
  persistError?: string;
}

export async function persistGeneratedImage(
  imageSource: string | null | undefined,
  save: (source: string) => Promise<string>,
): Promise<PersistedGeneratedImage> {
  if (!imageSource) return {};
  try {
    return { imageId: await save(imageSource) };
  } catch (err) {
    return {
      imageBase64: imageSource,
      persistError: err instanceof Error ? err.message : String(err),
    };
  }
}
