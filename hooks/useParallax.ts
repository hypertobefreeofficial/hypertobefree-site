"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildParallaxTransform } from "../lib/hero3d/hero3dLayers";

export type ParallaxOffset = {
  x: number;
  y: number;
};

export type ParallaxMode = "static" | "mouse" | "orientation";

export type UseParallaxOptions = {
  /** 0–1 lerp toward target each frame (higher = snappier). */
  smoothing?: number;
  /** Clamp for normalized offset magnitude. */
  maxOffset?: number;
  /** Disable pointer tracking below this viewport width. */
  mobileBreakpointPx?: number;
};

export type UseParallaxReturn = {
  containerRef: (node: HTMLElement | null) => void;
  mode: ParallaxMode;
  reducedMotion: boolean;
  orientationAvailable: boolean;
  orientationPermission: "granted" | "denied" | "prompt" | "unsupported";
  requestOrientationAccess: () => Promise<boolean>;
  registerLayer: (
    depth: number,
    maxTranslatePx?: number
  ) => (node: HTMLElement | null) => void;
};

type LayerRegistration = {
  node: HTMLElement | null;
  depth: number;
  maxTranslatePx?: number;
};

type DeviceOrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isCoarsePointer() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

function getOrientationRequestPermission() {
  if (typeof DeviceOrientationEvent === "undefined") return undefined;
  return (DeviceOrientationEvent as DeviceOrientationCtor).requestPermission;
}

export function useParallax(options: UseParallaxOptions = {}): UseParallaxReturn {
  const {
    smoothing = 0.08,
    maxOffset = 1,
    mobileBreakpointPx = 768,
  } = options;

  const containerNodeRef = useRef<HTMLElement | null>(null);
  const layersRef = useRef<Map<symbol, LayerRegistration>>(new Map());
  const targetRef = useRef<ParallaxOffset>({ x: 0, y: 0 });
  const currentRef = useRef<ParallaxOffset>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const orientationBaselineRef = useRef<{ beta: number; gamma: number } | null>(
    null
  );

  const [mode, setMode] = useState<ParallaxMode>("static");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [orientationAvailable, setOrientationAvailable] = useState(false);
  const [orientationPermission, setOrientationPermission] = useState<
    "granted" | "denied" | "prompt" | "unsupported"
  >("unsupported");

  const applyLayerTransforms = useCallback((offset: ParallaxOffset) => {
    layersRef.current.forEach(({ node, depth, maxTranslatePx }) => {
      if (!node) return;
      node.style.transform = buildParallaxTransform(
        offset.x,
        offset.y,
        depth,
        maxTranslatePx
      );
    });
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;

    const tick = () => {
      const target = targetRef.current;
      const current = currentRef.current;

      current.x += (target.x - current.x) * smoothing;
      current.y += (target.y - current.y) * smoothing;

      if (
        Math.abs(target.x - current.x) < 0.0004 &&
        Math.abs(target.y - current.y) < 0.0004
      ) {
        current.x = target.x;
        current.y = target.y;
      }

      applyLayerTransforms(current);

      if (current.x !== target.x || current.y !== target.y) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [applyLayerTransforms, smoothing]);

  const setTarget = useCallback(
    (next: ParallaxOffset) => {
      targetRef.current = {
        x: clamp(next.x, -maxOffset, maxOffset),
        y: clamp(next.y, -maxOffset, maxOffset),
      };
      startLoop();
    },
    [maxOffset, startLoop]
  );

  const resetMotion = useCallback(() => {
    targetRef.current = { x: 0, y: 0 };
    currentRef.current = { x: 0, y: 0 };
    applyLayerTransforms({ x: 0, y: 0 });
    stopLoop();
  }, [applyLayerTransforms, stopLoop]);

  const containerRef = useCallback((node: HTMLElement | null) => {
    containerNodeRef.current = node;
  }, []);

  const registerLayer = useCallback(
    (depth: number, maxTranslatePx?: number) => {
      const key = Symbol(`hero3d-layer-${depth}`);
      return (node: HTMLElement | null) => {
        if (node) {
          node.style.willChange = "transform";
          node.style.backfaceVisibility = "hidden";
          layersRef.current.set(key, { node, depth, maxTranslatePx });
          node.style.transform = buildParallaxTransform(
            currentRef.current.x,
            currentRef.current.y,
            depth,
            maxTranslatePx
          );
        } else {
          layersRef.current.delete(key);
        }
      };
    },
    []
  );

  useEffect(() => {
    const reduced = prefersReducedMotion();
    setReducedMotion(reduced);

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => {
      const nextReduced = motionQuery.matches;
      setReducedMotion(nextReduced);
      if (nextReduced) {
        setMode("static");
        resetMotion();
      }
    };

    motionQuery.addEventListener("change", onMotionChange);
    return () => motionQuery.removeEventListener("change", onMotionChange);
  }, [resetMotion]);

  useEffect(() => {
    if (reducedMotion) {
      resetMotion();
      return;
    }

    const container = containerNodeRef.current;
    if (!container) return;

    const coarse = isCoarsePointer();
    const narrow = window.innerWidth < mobileBreakpointPx;

    const handlePointerMove = (event: PointerEvent) => {
      if (coarse && narrow) return;

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2;

      setMode("mouse");
      setTarget({ x: nx, y: ny });
    };

    const handlePointerLeave = () => {
      setTarget({ x: 0, y: 0 });
    };

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [mobileBreakpointPx, reducedMotion, resetMotion, setTarget]);

  useEffect(() => {
    if (reducedMotion) return;
    if (orientationPermission === "denied" || orientationPermission === "prompt") {
      return;
    }

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return;

      if (!orientationBaselineRef.current) {
        orientationBaselineRef.current = {
          beta: event.beta,
          gamma: event.gamma,
        };
      }

      const base = orientationBaselineRef.current;
      const gammaDelta = clamp((event.gamma - base.gamma) / 32, -1, 1);
      const betaDelta = clamp((event.beta - base.beta) / 24, -1, 1);

      setMode("orientation");
      setTarget({ x: gammaDelta, y: betaDelta * 0.65 });
    };

    window.addEventListener("deviceorientation", handleOrientation, true);

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, [orientationPermission, reducedMotion, setTarget]);

  useEffect(() => {
    if (reducedMotion) return;

    const hasOrientation =
      typeof window !== "undefined" &&
      "DeviceOrientationEvent" in window &&
      isCoarsePointer();

    if (!hasOrientation) {
      setOrientationAvailable(false);
      setOrientationPermission("unsupported");
      return;
    }

    setOrientationAvailable(true);
    const requestPermission = getOrientationRequestPermission();
    setOrientationPermission(
      typeof requestPermission === "function" ? "prompt" : "granted"
    );
  }, [reducedMotion]);

  const requestOrientationAccess = useCallback(async () => {
    const requestPermission = getOrientationRequestPermission();

    if (typeof requestPermission !== "function") {
      setOrientationPermission("granted");
      return true;
    }

    try {
      const state = await requestPermission();
      const granted = state === "granted";
      setOrientationPermission(granted ? "granted" : "denied");
      if (granted) {
        orientationBaselineRef.current = null;
      } else {
        setMode("static");
        resetMotion();
      }
      return granted;
    } catch {
      setOrientationPermission("denied");
      setMode("static");
      resetMotion();
      return false;
    }
  }, [resetMotion]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  return {
    containerRef,
    mode,
    reducedMotion,
    orientationAvailable,
    orientationPermission,
    requestOrientationAccess,
    registerLayer,
  };
}
