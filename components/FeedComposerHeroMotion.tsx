"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import styles from "./FeedComposerHeroMotion.module.css";

export const FEED_COMPOSER_HERO_SRC =
  "/images/feed/freedom-feed-hero-final.webp";

const DESKTOP_POINTER_MAX_X = 3.5;
const DESKTOP_POINTER_MAX_Y = 2.5;
const MOBILE_TILT_MAX_X = 4.5;
const MOBILE_TILT_MAX_Y = 2.5;

const SMOOTHING_FOLLOW = 0.05;
const SMOOTHING_RETURN = 0.034;
const SMOOTHING_TILT = 0.04;
const MOBILE_BREAKPOINT_PX = 768;

type MotionOffset = {
  x: number;
  y: number;
};

type DeviceOrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const ZERO_MOTION: MotionOffset = { x: 0, y: 0 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(current: number, target: number, alpha: number) {
  return current + (target - current) * alpha;
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

function applySoftDeadzone(value: number, threshold = 0.12) {
  if (Math.abs(value) < threshold) return 0;
  const sign = value < 0 ? -1 : 1;
  return sign * ((Math.abs(value) - threshold) / (1 - threshold));
}

type FeedComposerHeroMotionProps = {
  src?: string;
};

export function FeedComposerHeroMotion({
  src = FEED_COMPOSER_HERO_SRC,
}: FeedComposerHeroMotionProps) {
  const sensorRef = useRef<HTMLDivElement>(null);
  const interactiveRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<MotionOffset>({ ...ZERO_MOTION });
  const currentRef = useRef<MotionOffset>({ ...ZERO_MOTION });
  const rafRef = useRef<number | null>(null);
  const orientationBaselineRef = useRef<{ beta: number; gamma: number } | null>(
    null
  );
  const pointerActiveRef = useRef(false);
  const orientationActiveRef = useRef(false);
  const returningRef = useRef(false);
  const tiltModeRef = useRef(false);

  const [reducedMotion, setReducedMotion] = useState(false);
  const [orientationPermission, setOrientationPermission] = useState<
    "granted" | "denied" | "prompt" | "unsupported"
  >("unsupported");

  const applyInteractiveTransform = useCallback((motion: MotionOffset) => {
    const node = interactiveRef.current;
    if (!node) return;
    node.style.transform = `translate3d(${motion.x.toFixed(2)}px, ${motion.y.toFixed(2)}px, 0)`;
  }, []);

  const resetInteractive = useCallback(() => {
    targetRef.current = { ...ZERO_MOTION };
    currentRef.current = { ...ZERO_MOTION };
    returningRef.current = false;
    tiltModeRef.current = false;
    applyInteractiveTransform(ZERO_MOTION);
  }, [applyInteractiveTransform]);

  const stopAnimationLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startAnimationLoop = useCallback(() => {
    if (rafRef.current !== null) return;

    const tick = () => {
      const target = targetRef.current;
      const current = currentRef.current;
      const smoothing = returningRef.current
        ? SMOOTHING_RETURN
        : tiltModeRef.current
          ? SMOOTHING_TILT
          : SMOOTHING_FOLLOW;

      current.x = lerp(current.x, target.x, smoothing);
      current.y = lerp(current.y, target.y, smoothing);

      applyInteractiveTransform(current);

      const settled =
        Math.abs(target.x - current.x) < 0.02 &&
        Math.abs(target.y - current.y) < 0.02 &&
        target.x === 0 &&
        target.y === 0;

      if (settled) {
        currentRef.current = { ...ZERO_MOTION };
        applyInteractiveTransform(ZERO_MOTION);
        returningRef.current = false;
        rafRef.current = null;
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [applyInteractiveTransform]);

  const setPointerTarget = useCallback(
    (nx: number, ny: number, maxX: number, maxY: number) => {
      targetRef.current = {
        x: clamp(nx, -1, 1) * maxX,
        y: clamp(ny, -1, 1) * maxY,
      };
      returningRef.current = false;
      tiltModeRef.current = maxX === MOBILE_TILT_MAX_X;
      startAnimationLoop();
    },
    [startAnimationLoop]
  );

  const easeInteractiveToCenter = useCallback(() => {
    targetRef.current = { ...ZERO_MOTION };
    returningRef.current = true;
    tiltModeRef.current = false;
    startAnimationLoop();
  }, [startAnimationLoop]);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    setReducedMotion(reduced);
    if (reduced) {
      resetInteractive();
      stopAnimationLoop();
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => {
      const nextReduced = motionQuery.matches;
      setReducedMotion(nextReduced);
      if (nextReduced) {
        resetInteractive();
        stopAnimationLoop();
      }
    };

    motionQuery.addEventListener("change", onMotionChange);
    return () => motionQuery.removeEventListener("change", onMotionChange);
  }, [resetInteractive, stopAnimationLoop]);

  useEffect(() => {
    if (reducedMotion) return;

    const hasOrientation =
      typeof window !== "undefined" &&
      "DeviceOrientationEvent" in window &&
      isCoarsePointer();

    if (!hasOrientation) {
      setOrientationPermission("unsupported");
      return;
    }

    const requestPermission = getOrientationRequestPermission();
    setOrientationPermission(
      typeof requestPermission === "function" ? "prompt" : "granted"
    );
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;

    const sensor = sensorRef.current;
    if (!sensor) return;

    const coarse = isCoarsePointer();
    const narrow = window.innerWidth < MOBILE_BREAKPOINT_PX;

    const handlePointerMove = (event: PointerEvent) => {
      if (coarse && narrow) return;

      const rect = sensor.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      pointerActiveRef.current = true;
      orientationActiveRef.current = false;

      const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2;

      setPointerTarget(nx, ny * 0.82, DESKTOP_POINTER_MAX_X, DESKTOP_POINTER_MAX_Y);
    };

    const handlePointerLeave = () => {
      pointerActiveRef.current = false;
      if (!orientationActiveRef.current) {
        easeInteractiveToCenter();
      }
    };

    sensor.addEventListener("pointermove", handlePointerMove);
    sensor.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      sensor.removeEventListener("pointermove", handlePointerMove);
      sensor.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [easeInteractiveToCenter, reducedMotion, setPointerTarget]);

  useEffect(() => {
    if (reducedMotion) return;
    if (orientationPermission !== "granted") return;
    if (!isCoarsePointer()) return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (pointerActiveRef.current) return;
      if (event.beta == null || event.gamma == null) return;

      if (!orientationBaselineRef.current) {
        orientationBaselineRef.current = {
          beta: event.beta,
          gamma: event.gamma,
        };
      }

      const base = orientationBaselineRef.current;
      const gammaDelta = applySoftDeadzone(
        clamp((event.gamma - base.gamma) / 44, -0.55, 0.55),
        0.14
      );
      const betaDelta = applySoftDeadzone(
        clamp((event.beta - base.beta) / 36, -0.45, 0.45),
        0.14
      );

      orientationActiveRef.current = true;
      setPointerTarget(
        gammaDelta,
        betaDelta * 0.55,
        MOBILE_TILT_MAX_X,
        MOBILE_TILT_MAX_Y
      );
    };

    window.addEventListener("deviceorientation", handleOrientation, true);

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
      orientationActiveRef.current = false;
    };
  }, [orientationPermission, reducedMotion, setPointerTarget]);

  useEffect(() => () => stopAnimationLoop(), [stopAnimationLoop]);

  return (
    <div className={styles.motionRoot}>
      <div ref={sensorRef} className={styles.sensor}>
        <div ref={interactiveRef} className={styles.interactive}>
          <div
            className={`${styles.ambient} ${
              reducedMotion ? "" : styles.ambientActive
            }`}
          >
            <div className={styles.imageOverscan}>
              <Image
                src={src}
                alt=""
                fill
                priority={false}
                quality={90}
                sizes="(max-width: 768px) 100vw, 768px"
                className={styles.image}
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.polish} aria-hidden>
        <div className={styles.sunBloom} />
        <div className={styles.edgeVignette} />
        <div className={styles.grain} />
        {!reducedMotion ? (
          <div className={styles.particles}>
            {Array.from({ length: 7 }, (_, index) => (
              <span
                key={index}
                className={styles.particle}
                style={{ "--particle-i": index } as CSSProperties}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
