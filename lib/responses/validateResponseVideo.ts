export const MAX_RESPONSE_VIDEO_SECONDS = 30;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export function validateVideoFile(file: File): string | null {
  const type = file.type || "";
  const looksLikeVideo =
    type.startsWith("video/") || /\.(mp4|mov|webm|m4v|ogg)$/i.test(file.name);
  if (!looksLikeVideo) {
    return "Please choose a video file (MP4, MOV, or WebM).";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return "That video is too large. Please choose a file under 100 MB.";
  }
  return null;
}

export function readVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video duration."));
    };
    video.src = url;
  });
}

export async function validateResponseVideo(file: File): Promise<string | null> {
  const base = validateVideoFile(file);
  if (base) return base;
  try {
    const duration = await readVideoDuration(file);
    if (duration > MAX_RESPONSE_VIDEO_SECONDS + 0.5) {
      return `Videos must be ${MAX_RESPONSE_VIDEO_SECONDS} seconds or shorter.`;
    }
  } catch {
    return "Could not read this video file.";
  }
  return null;
}
