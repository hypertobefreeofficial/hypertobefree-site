import { describe, expect, it } from "vitest";
import type { CreatorStudioDesign } from "./creationCenter";
import { buildCreatorStudioAiSuggestionsPayload } from "./creatorStudioMetadata";
import {
  isCreatorStudioPhotoStory,
  isCreatorStudioVideoStory,
  readCreatorStudioVideoFeedDesign,
  resolveStoryDetailDestination,
} from "./creatorStudioStoryNavigation";

const creatorStudioDesign: CreatorStudioDesign = {
  id: "design-1",
  studioPath: "tell-story",
  sourceMode: "upload-video",
  title: "Testimony",
  overlayText: "God is good",
  caption: "Shared story",
  category: "Testimony",
  topic: "testimony",
  templateId: "none",
  styleMood: "Warm encouragement",
  layoutType: "hero-overlay",
  scriptureSuggestion: "",
  suggestedPostFormat: "HTBF video post",
  colorPalette: ["#062A57", "#FFFFFF", "#D4AF37"],
  typographyStyle: "Bold HTBF headline",
  designTreatment: "Warm encouragement",
  layerStyles: {
    title: {
      x: 10,
      y: 10,
      width: 80,
      align: "left",
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "bold",
      hidden: false,
      order: 1,
    },
  },
};

const creatorStudioStory = {
  ai_suggestions: buildCreatorStudioAiSuggestionsPayload({
    design: creatorStudioDesign,
    prompts: {},
    suggestions: null,
    selectedTemplate: null,
  }),
  creation_mode: "creator-studio",
};

describe("resolveStoryDetailDestination", () => {
  it("routes Creator Studio video posts to the Video Feed", () => {
    expect(
      resolveStoryDetailDestination({
        ...creatorStudioStory,
        video_url: "https://cdn.example/video.mp4",
        signed_video_url: "https://cdn.example/signed-video.mp4",
      })
    ).toBe("video-feed");
  });

  it("routes Creator Studio photo posts to the photo viewer", () => {
    expect(
      resolveStoryDetailDestination({
        ...creatorStudioStory,
        image_url: "user-1/photo.jpg",
        signed_image_url: "https://cdn.example/photo.jpg",
      })
    ).toBe("photo-viewer");
  });

  it("routes non-Creator-Studio videos to the Video Feed", () => {
    expect(
      resolveStoryDetailDestination({
        ai_suggestions: null,
        video_url: "https://cdn.example/video.mp4",
      })
    ).toBe("video-feed");
  });
});

describe("Creator Studio video feed metadata", () => {
  it("identifies Creator Studio video metadata for the Video Feed", () => {
    expect(
      isCreatorStudioVideoStory({
        ...creatorStudioStory,
        video_url: "https://cdn.example/video.mp4",
      })
    ).toBe(true);

    expect(
      readCreatorStudioVideoFeedDesign({
        ...creatorStudioStory,
        signed_video_url: "https://cdn.example/signed-video.mp4",
      })?.overlayText
    ).toBe("God is good");
  });

  it("does not treat Creator Studio photo posts as Video Feed overlay stories", () => {
    expect(
      isCreatorStudioPhotoStory({
        ...creatorStudioStory,
        image_url: "user-1/photo.jpg",
      })
    ).toBe(true);

    expect(
      readCreatorStudioVideoFeedDesign({
        ...creatorStudioStory,
        image_url: "user-1/photo.jpg",
      })
    ).toBeNull();
  });
});
