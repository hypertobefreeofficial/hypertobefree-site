/**
 * Deterministic VU-to-session mapping for Gate A synthetic pool reuse.
 */

export const GATE_A_SYNTHETIC_POOL_SIZE = 10;

export function mapVuToSessionIndex(vuId, poolSize = GATE_A_SYNTHETIC_POOL_SIZE) {
  if (!Number.isInteger(vuId) || vuId < 1) {
    throw new Error("VU id must be a positive integer.");
  }
  if (!Number.isInteger(poolSize) || poolSize < 1) {
    throw new Error("Pool size must be a positive integer.");
  }
  return (vuId - 1) % poolSize;
}

export function vusPerSessionDistribution(
  totalVus,
  poolSize = GATE_A_SYNTHETIC_POOL_SIZE
) {
  if (!Number.isInteger(totalVus) || totalVus < 1) {
    throw new Error("Total VUs must be a positive integer.");
  }

  const counts = Array.from({ length: poolSize }, () => 0);
  for (let vu = 1; vu <= totalVus; vu += 1) {
    counts[mapVuToSessionIndex(vu, poolSize)] += 1;
  }
  return counts;
}
