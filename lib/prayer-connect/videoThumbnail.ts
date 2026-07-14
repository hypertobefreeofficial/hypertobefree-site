export type VideoThumbnailResult = {
  blob: Blob;
  mimeType: "image/webp" | "image/jpeg";
  width: number;
  height: number;
};

export type VideoThumbnailError = {
  code:
    | "metadata_timeout"
    | "seek_failed"
    | "canvas_failed"
    | "encode_failed"
    | "load_failed";
  message: string;
};

const MAX_THUMBNAIL_WIDTH = 1280;
const METADATA_TIMEOUT_MS = 20_000;
const SEEK_TIMEOUT_MS = 8_000;

function pickSeekTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [0.05, 0];
  }
  if (duration < 0.25) {
    return [duration * 0.5, 0.05, 0];
  }
  if (duration < 1) {
    return [duration * 0.5, duration * 0.1, 0.05, 0];
  }
  const primary = Math.min(1, duration * 0.1);
  return [primary, 1, duration * 0.25, 0.05, 0];
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function waitForEvent(
  target: HTMLVideoElement,
  eventName: keyof HTMLMediaElementEventMap
) {
  return new Promise<void>((resolve, reject) => {
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Video ${eventName} failed.`));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, onSuccess);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(eventName, onSuccess, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, time: number) {
  video.currentTime = time;
  await waitForEvent(video, "seeked");
}

function scaleDimensions(width: number, height: number, maxWidth: number) {
  if (width <= 0 || height <= 0) {
    return { width: 720, height: 1280 };
  }
  if (width <= maxWidth) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxWidth / width;
  return {
    width: maxWidth,
    height: Math.round(height * scale),
  };
}

async function encodeCanvas(canvas: HTMLCanvasElement): Promise<VideoThumbnailResult> {
  const webp = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/webp", 0.82);
  });

  if (webp && webp.size > 0) {
    return {
      blob: webp,
      mimeType: "image/webp",
      width: canvas.width,
      height: canvas.height,
    };
  }

  const jpeg = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82);
  });

  if (!jpeg || jpeg.size <= 0) {
    throw new Error("Could not encode thumbnail image.");
  }

  return {
    blob: jpeg,
    mimeType: "image/jpeg",
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Extract a still frame from a local video File for use as a persisted poster.
 * Uses browser metadata + canvas — suitable for uploads and mobile recordings.
 */
export async function createVideoThumbnailFromFile(
  file: File
): Promise<VideoThumbnailResult> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");

  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl;

  try {
    await withTimeout(
      waitForEvent(video, "loadedmetadata"),
      METADATA_TIMEOUT_MS,
      "Timed out reading video metadata."
    );

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const seekTimes = pickSeekTimes(duration);
    let lastError: Error | null = null;

    for (const seekTime of seekTimes) {
      try {
        await withTimeout(
          seekVideo(video, seekTime),
          SEEK_TIMEOUT_MS,
          "Timed out seeking video for thumbnail."
        );

        const { width, height } = scaleDimensions(
          video.videoWidth,
          video.videoHeight,
          MAX_THUMBNAIL_WIDTH
        );

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Could not create thumbnail canvas.");
        }

        context.drawImage(video, 0, 0, width, height);
        return await encodeCanvas(canvas);
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error("Thumbnail capture failed.");
      }
    }

    throw lastError ?? new Error("Could not capture a video thumbnail.");
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export function thumbnailFailureMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Could not create a video thumbnail. The video will still upload, but cards may show a generic preview until a thumbnail is available.";
}
