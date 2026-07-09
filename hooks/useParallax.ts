"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildParallaxTransform } from "../lib/hero3d/hero3dLayers";

export type ParallaxOffset = {
  x: number;
  y: number;
};

export type ParallaxMode = "static" | "mouse" | "orientation";

export type UseParallaxOptions = {
  smoothing?: number;
  maxOffset?: number;
  mobileBreakpointPx?: number;
  /** Scale all layer movement (0–1). Reduced on low-end devices. */
  intensity?: number;
};

export type UseParallaxReturn = {
  containerRef: (node: HTMLElement | null) => void;
  mode: ParallaxMode;
  reducedMotion: boolean;
  lowPowerMode: boolean;
  orientationAvailable: boolean;
  orientationPermission: "granted" | "denied" | "prompt" | "unsupported";
  requestOrientationAccess: () => Promise<boolean>;
  registerLayer: (parallaxPx: number) => (node: HTMLElement | null) => void;
  motionIntensity: number;
};

type LayerRegistration = {
  node: HTMLElement | null;
  parallaxPx: number;
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

function detectLowPowerMode() {
  if (typeof window === "undefined") return false;

  const cores = navigator.hardwareConcurrency ?? 8;
  const saveData =
    "connection" in navigator &&
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData;

  return cores <= 4 || Boolean(saveData);
}

function getOrientationRequestPermission() {
  if (typeof DeviceOrientationEvent === "undefined") return undefined;
  return (DeviceOrientationEvent as DeviceOrientationCtor).requestPermission;
}

export function useParallax(options: UseParallaxOptions = {}): UseParallaxReturn {
  const {
    smoothing = 0.065,
    maxOffset = 1,
    mobileBreakpointPx = 768,
    intensity: intensityOption = 1,
  } = options;

  const containerNodeRef = useRef<HTMLElement | null>(null);
  const layersRef = useRef<Map<symbol, LayerRegistration>>(new Map());
  const targetRef = useRef<ParallaxOffset>({ x: 0, y: 0 });
  const currentRef = useRef<ParallaxOffset>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const orientationBaselineRef = useRef<{ beta: number; gamma: number } | null>(
    null
  );
  const intensityRef = useRef(intensityOption);

  const [mode, setMode] = useState<ParallaxMode>("static");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [lowPowerMode, setLowPowerMode] = useState(false);
  const [orientationAvailable, setOrientationAvailable] = useState(false);
  const [orientationPermission, setOrientationPermission] = useState<
    "granted" | "denied" | "prompt" | "unsupported"
  >("unsupported");
  const [motionIntensity, setMotionIntensity] = useState(intensityOption);

  useEffect(() => {
    const lowPower = detectLowPowerMode();
    setLowPowerMode(lowPower);
    const nextIntensity = lowPower ? intensityOption * 0.55 : intensityOption;
    intensityRef.current = nextIntensity;
    setMotionIntensity(nextIntensity);
  }, [intensityOption]);

  const applyLayerTransforms = useCallback((offset: ParallaxOffset) => {
    const intensity = intensityRef.current;
    layersRef.current.forEach(({ node, parallaxPx }) => {
      if (!node) return;
      node.style.transform = buildParallaxTransform(
        offset.x,
        offset.y,
        parallaxPx,
        intensity
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
        Math.abs(target.x - current.x) < 0.0003 &&
        Math.abs(target.y - current.y) < 0.0003
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
      if (reducedMotion) return;

      targetRef.current = {
        x: clamp(next.x, -maxOffset, maxOffset),
        y: clamp(next.y, -maxOffset, maxOffset),
      };
      startLoop();
    },
    [maxOffset, reducedMotion, startLoop]
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

  const registerLayer = useCallback((parallaxPx: number) => {
    const key = Symbol(`hero3d-${parallaxPx}`);
    return (node: HTMLElement | null) => {
      if (node) {
        node.style.willChange = "transform";
        node.style.backfaceVisibility = "hidden";
        layersRef.current.set(key, { node, parallaxPx });
        node.style.transform = buildParallaxTransform(
          currentRef.current.x,
          currentRef.current.y,
          parallaxPx,
          intensityRef.current
        );
      } else {
        layersRef.current.delete(key);
      }
    };
  }, []);

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
      setTarget({ x: nx, y: ny * 0.85 });
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
      const gammaDelta = clamp((event.gamma - base.gamma) / 28, -1, 1);
      const betaDelta = clamp((event.beta - base.beta) / 22, -1, 1);

      setMode("orientation");
      setTarget({ x: gammaDelta, y: betaDelta * 0.6 });
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
    lowPowerMode,
    orientationAvailable,
    orientationPermission,
    requestOrientationAccess,
    registerLayer,
    motionIntensity,
  };
}
