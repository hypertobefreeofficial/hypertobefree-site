import { MarketingSection } from "./MarketingSection";
import { SectionHeader } from "./SectionHeader";
import { StoryPreviewCard, type StoryPreview } from "./StoryPreviewCard";

const previewStories: StoryPreview[] = [
  {
    type: "Praise Report",
    title: "God gave me peace when I felt overwhelmed.",
    location: "Phoenix, USA",
    tag: "Peace",
  },
  {
    type: "Testimony",
    title: "Jesus restored hope in my family.",
    location: "Lagos, Nigeria",
    tag: "Restoration",
  },
  {
    type: "Video Story",
    title: "The Holy Spirit helped me forgive and move forward.",
    location: "Manila, Philippines",
    tag: "Freedom",
  },
];

export function StoriesSection() {
  return (
    <MarketingSection id="stories">
      <SectionHeader
        eyebrow="Freedom Feed"
        title="Stories being shared now"
        action={{ label: "View More Stories", href: "/stories" }}
      />

      <div className="grid gap-5 md:grid-cols-3">
        {previewStories.map((story, index) => (
          <StoryPreviewCard key={story.title} story={story} index={index} />
        ))}
      </div>
    </MarketingSection>
  );
}
