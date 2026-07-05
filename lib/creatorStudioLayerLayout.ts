import type { CreatorStudioLayerStyle } from "./creationCenter";
import {
  getCreatorStudioCanvasSafeInset,
  getCreatorStudioLayerCoordinates,
} from "./creationCenter";

export function getCreatorStudioAvailableWidthPercent(
  layerStyle: CreatorStudioLayerStyle,
  options?: { reserveMobileBottom?: boolean }
): number {
  const inset = getCreatorStudioCanvasSafeInset(options?.reserveMobileBottom);
  const { x } = getCreatorStudioLayerCoordinates(layerStyle, options);
  const align = layerStyle.align ?? "left";

  if (align === "center" || x === 50) {
    return Math.max(0, 100 - inset.left - inset.right);
  }

  if (align === "right" || x >= 70) {
    return Math.max(0, x - inset.left);
  }

  return Math.max(0, 100 - inset.right - x);
}

/** Preserves explicit user width unless it exceeds the mobile safe area. */
export function resolveCreatorStudioLayerMaxWidthStyle(
  layerStyle: CreatorStudioLayerStyle,
  options?: {
    reserveMobileBottom?: boolean;
    constrainToSafeArea?: boolean;
  }
): string | undefined {
  const explicit = layerStyle.maxWidth ?? layerStyle.width;

  if (explicit === undefined) {
    return undefined;
  }

  if (!options?.constrainToSafeArea) {
    return `${explicit}%`;
  }

  const available = getCreatorStudioAvailableWidthPercent(layerStyle, options);

  if (explicit <= available) {
    return `${explicit}%`;
  }

  return `${available}%`;
}

export type ToolbarPlacementRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function computeCreatorStudioToolbarPlacement(options: {
  canvasWidth: number;
  canvasHeight: number;
  layerRect: ToolbarPlacementRect;
  toolbarWidth: number;
  toolbarHeight: number;
  paddingX: number;
  paddingY: number;
}): { top: number; left: number } {
  const {
    canvasWidth,
    canvasHeight,
    layerRect,
    toolbarWidth,
    toolbarHeight,
    paddingX,
    paddingY,
  } = options;

  const layerRight = layerRect.left + layerRect.width;
  const layerBottom = layerRect.top + layerRect.height;
  const layerCenterX = layerRect.left + layerRect.width / 2;
  const layerCenterY = layerRect.top + layerRect.height / 2;

  const candidates: { top: number; left: number; score: number }[] = [
    {
      top: layerRect.top - toolbarHeight - paddingY,
      left: layerCenterX - toolbarWidth / 2,
      score: 0,
    },
    {
      top: layerBottom + paddingY,
      left: layerCenterX - toolbarWidth / 2,
      score: 0,
    },
    {
      top: layerCenterY - toolbarHeight / 2,
      left: layerRect.left - toolbarWidth - paddingX,
      score: 0,
    },
    {
      top: layerCenterY - toolbarHeight / 2,
      left: layerRight + paddingX,
      score: 0,
    },
  ];

  function clampToCanvas(top: number, left: number) {
    return {
      top: Math.max(
        paddingY,
        Math.min(top, canvasHeight - toolbarHeight - paddingY)
      ),
      left: Math.max(
        paddingX,
        Math.min(left, canvasWidth - toolbarWidth - paddingX)
      ),
    };
  }

  function overlapsLayer(top: number, left: number) {
    const toolbarRect = {
      top,
      left,
      right: left + toolbarWidth,
      bottom: top + toolbarHeight,
    };

    return !(
      toolbarRect.right <= layerRect.left ||
      toolbarRect.left >= layerRight ||
      toolbarRect.bottom <= layerRect.top ||
      toolbarRect.top >= layerBottom
    );
  }

  for (const candidate of candidates) {
    const clamped = clampToCanvas(candidate.top, candidate.left);
    candidate.top = clamped.top;
    candidate.left = clamped.left;

    if (overlapsLayer(candidate.top, candidate.left)) {
      candidate.score += 100;
    }

    const offCanvas =
      candidate.top <= paddingY + 1 ||
      candidate.left <= paddingX + 1 ||
      candidate.top + toolbarHeight >= canvasHeight - paddingY - 1 ||
      candidate.left + toolbarWidth >= canvasWidth - paddingX - 1;

    if (offCanvas) {
      candidate.score += 20;
    }
  }

  candidates.sort((left, right) => left.score - right.score);

  const best = candidates[0] ?? {
    top: layerBottom + paddingY,
    left: layerCenterX - toolbarWidth / 2,
  };

  return clampToCanvas(best.top, best.left);
}
