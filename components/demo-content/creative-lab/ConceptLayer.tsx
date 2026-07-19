import type { ReactNode } from "react";
import styles from "./creativeLab.module.css";
import type { FlagshipMomentId } from "./creativeConcepts";

type ConceptLayerProps = {
  momentId: FlagshipMomentId;
  activeMomentId: FlagshipMomentId;
  reducedMotion: boolean;
  children: ReactNode;
};

export function ConceptLayer({
  momentId,
  activeMomentId,
  reducedMotion,
  children,
}: ConceptLayerProps) {
  const visible = momentId === activeMomentId;

  return (
    <div
      className={[
        styles.conceptLayer,
        visible ? styles.conceptLayerVisible : "",
        reducedMotion ? styles.conceptLayerReduced : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden={!visible}
    >
      {children}
    </div>
  );
}
