export function getVideoStoragePath(videoUrl: string | null | undefined) {
  if (!videoUrl) return null;

  if (videoUrl.includes("story-videos/")) {
    const afterBucket = videoUrl.split("story-videos/")[1];
    const pathOnly = afterBucket.split("?")[0];
    return decodeURIComponent(pathOnly);
  }

  if (videoUrl.startsWith("http")) {
    return null;
  }

  return videoUrl;
}

export function getPhotoStoragePath(imageUrl: string | null | undefined) {
  if (!imageUrl) return null;

  if (imageUrl.includes("story-images/")) {
    const afterBucket = imageUrl.split("story-images/")[1];
    const pathOnly = afterBucket.split("?")[0];
    return decodeURIComponent(pathOnly);
  }

  if (imageUrl.startsWith("http")) {
    return null;
  }

  return imageUrl;
}

export function getThumbnailStoragePath(
  thumbnailUrl: string | null | undefined
) {
  if (!thumbnailUrl) return null;

  if (thumbnailUrl.includes("story-thumbnails/")) {
    const afterBucket = thumbnailUrl.split("story-thumbnails/")[1];
    const pathOnly = afterBucket.split("?")[0];
    return decodeURIComponent(pathOnly);
  }

  if (thumbnailUrl.startsWith("http")) {
    return null;
  }

  return thumbnailUrl;
}
