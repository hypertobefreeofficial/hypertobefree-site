import { afterEach, describe, expect, it } from "vitest";
import {
  buildCreatorStudioPublishSnapshot,
  revokeCreatorStudioPublishSnapshotMedia,
} from "./creatorStudioPublishSnapshot";
import type { CreatorStudioDesign } from "./creationCenter";

const design: CreatorStudioDesign = {
  id: "design-1",
  studioPath: "tell-story",
  sourceMode: "upload-photo",
  title: "Testimony",
  overlayText: "God is good",
  caption: "Shared story",
  category: "Testimony",
  topic: "testimony",
  templateId: "none",
  styleMood: "Warm encouragement",
  layoutType: "hero-overlay",
  scriptureSuggestion: "",
  suggestedPostFormat: "HTBF photo post",
  colorPalette: ["#062A57", "#FFFFFF", "#D4AF37"],
  typographyStyle: "Bold HTBF headline",
  designTreatment: "Warm encouragement",
};

describe("buildCreatorStudioPublishSnapshot", () => {
  const createdUrls: string[] = [];

  afterEach(() => {
    for (const url of createdUrls.splice(0)) {
      URL.revokeObjectURL(url);
    }
  });

  it("clones photo and video preview URLs from files for an immutable snapshot", () => {
    const photoFile = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    const videoFile = new File(["video"], "video.mp4", { type: "video/mp4" });
    const editorPhotoUrl = URL.createObjectURL(photoFile);
    const editorVideoUrl = URL.createObjectURL(videoFile);
    createdUrls.push(editorPhotoUrl, editorVideoUrl);

    const snapshot = buildCreatorStudioPublishSnapshot({
      design,
      photoFile,
      videoFile,
      photoPreviewUrl: editorPhotoUrl,
      videoPreviewUrl: editorVideoUrl,
    });

    createdUrls.push(snapshot.photoPreviewUrl!, snapshot.videoPreviewUrl!);

    expect(snapshot.expectsPhoto).toBe(true);
    expect(snapshot.expectsVideo).toBe(true);
    expect(snapshot.photoPreviewUrl).toMatch(/^blob:/);
    expect(snapshot.videoPreviewUrl).toMatch(/^blob:/);
    expect(snapshot.photoPreviewUrl).not.toBe(editorPhotoUrl);
    expect(snapshot.videoPreviewUrl).not.toBe(editorVideoUrl);

    URL.revokeObjectURL(editorPhotoUrl);
    URL.revokeObjectURL(editorVideoUrl);

    expect(snapshot.photoPreviewUrl).toMatch(/^blob:/);
    expect(snapshot.videoPreviewUrl).toMatch(/^blob:/);
  });

  it("preserves existing preview URLs when files are unavailable", () => {
    const snapshot = buildCreatorStudioPublishSnapshot({
      design,
      photoFile: null,
      videoFile: null,
      photoPreviewUrl: "blob:http://localhost/photo",
      videoPreviewUrl: null,
    });

    expect(snapshot).toEqual({
      design,
      photoPreviewUrl: "blob:http://localhost/photo",
      videoPreviewUrl: null,
      expectsPhoto: true,
      expectsVideo: false,
    });
  });

  it("revokes snapshot-owned blob URLs on cleanup", () => {
    const photoFile = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    const snapshot = buildCreatorStudioPublishSnapshot({
      design,
      photoFile,
      videoFile: null,
      photoPreviewUrl: null,
      videoPreviewUrl: null,
    });

    const snapshotUrl = snapshot.photoPreviewUrl!;
    createdUrls.push(snapshotUrl);
    revokeCreatorStudioPublishSnapshotMedia(snapshot);

    expect(snapshot.photoPreviewUrl).toMatch(/^blob:/);
  });
});
