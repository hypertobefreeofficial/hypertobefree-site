import { VideoFeedExperience } from "../video-feed/page";

export default function VideosPage() {
  return (
    <VideoFeedExperience
      returnLabel="Back to Freedom Feed"
      returnPath="/feed"
      sourceContext="freedom-feed"
      videosPath="/videos"
    />
  );
}
