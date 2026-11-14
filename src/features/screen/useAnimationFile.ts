import { useCallback, useState } from 'react';
import { SCREEN_HEIGHT, SCREEN_WIDTH, decodeAnimation, encodeRgb565 } from '@/lib/screen';

/** The file the stage draws and the card sends. Kept above the tabs so it survives a switch. */
export type PickedAnimation = {
  readonly frames: Uint8Array[];
  readonly delays: number[];
  /** The frames the file holds, which can be more than the screen takes. */
  readonly frameCount: number;
  readonly truncated: boolean;
  readonly name: string;
};

const stillDelay = 100;

async function decodeStill(file: File): Promise<Omit<PickedAnimation, 'name'>> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no canvas');

    const scale = Math.max(SCREEN_WIDTH / bitmap.width, SCREEN_HEIGHT / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(
      bitmap,
      (SCREEN_WIDTH - width) / 2,
      (SCREEN_HEIGHT - height) / 2,
      width,
      height,
    );

    const frame = encodeRgb565(
      context.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).data,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
    );
    return { frames: [frame], delays: [stillDelay], frameCount: 1, truncated: false };
  } finally {
    bitmap.close();
  }
}

/**
 * Decodes a picked GIF or picture once, in the panel, so the stage and the card
 * read the same frames and a tab switch does not throw them away. Nothing is
 * stored after a reload.
 */
export function useAnimationFile() {
  const [picked, setPicked] = useState<PickedAnimation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);

    try {
      const animated = file.type === 'image/gif' || /\.gif$/i.test(file.name);
      const decoded = animated
        ? await decodeAnimation(file).then((result) => ({
            frames: result.frames,
            delays: result.delaysMs,
            frameCount: result.frameCount,
            truncated: result.truncated,
          }))
        : await decodeStill(file);

      setPicked({ ...decoded, name: file.name });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'That file could not be read. Use a GIF, PNG, JPEG or WebP.',
      );
      setPicked(null);
    }
  }, []);

  return { picked, error, pick };
}
