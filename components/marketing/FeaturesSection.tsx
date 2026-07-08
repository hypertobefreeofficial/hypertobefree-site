import {
  HeartHandshake,
  MessageCircleHeart,
  ShieldCheck,
} from "lucide-react";
import { FeatureInfoCard } from "./FeatureInfoCard";
import { MarketingSection } from "./MarketingSection";

export function FeaturesSection() {
  return (
    <MarketingSection>
      <div className="grid gap-6 md:grid-cols-3">
        <FeatureInfoCard
          index={0}
          icon={<HeartHandshake className="h-9 w-9" aria-hidden />}
          title="Encouraging responses"
          text="Simple response options keep the focus on prayer, praise, and encouragement."
        />
        <FeatureInfoCard
          index={1}
          icon={<MessageCircleHeart className="h-9 w-9" aria-hidden />}
          title="Prayer support"
          text="A quiet place for people to share prayer needs and receive encouragement."
        />
        <FeatureInfoCard
          index={2}
          icon={<ShieldCheck className="h-9 w-9" aria-hidden />}
          title="Protected space"
          text="Reporting and review tools help keep the community focused and safe."
        />
      </div>
    </MarketingSection>
  );
}
