"use client";

import {
  prepareCreatorStudioForEditing,
  type CreatorStudioDesign,
} from "../../lib/creationCenter";
import CreatorStudioPositionedLayers from "./CreatorStudioPositionedLayers";
import HTBFWatermark from "./HTBFWatermark";

type CreatorStudioStoryOverlayProps = {
  design: CreatorStudioDesign;
  compact?: boolean;
  hideCallToAction?: boolean;
};

export default function CreatorStudioStoryOverlay({
  design,
  compact = false,
  hideCallToAction = true,
}: CreatorStudioStoryOverlayProps) {
  const preparedDesign =
    design.layerStyles && Object.keys(design.layerStyles).length > 0
      ? design
      : prepareCreatorStudioForEditing(design);

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-[#031d3d]/75 via-[#062a57]/20 to-transparent" />
      <div className="pointer-events-none absolute inset-0 z-[2]">
        <HTBFWatermark />
      </div>
      <div className="pointer-events-none absolute inset-0 z-[3]">
        <CreatorStudioPositionedLayers
          design={preparedDesign}
          compact={compact}
          hideCallToAction={hideCallToAction}
        />
      </div>
    </>
  );
}
