/**
 * Best-effort local Mac process sampling for Gate A runs.
 * Uses ps against the current user's processes only — no elevated permissions.
 */

import { execSync } from "node:child_process";

function readProcessStats(pid) {
  if (!pid) return null;
  try {
    const output = execSync(`ps -o pcpu=,pmem= -p ${pid}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const [cpuRaw, memRaw] = output.split(/\s+/);
    const cpu = Number.parseFloat(cpuRaw);
    const memory = Number.parseFloat(memRaw);
    if (!Number.isFinite(cpu) || !Number.isFinite(memory)) return null;
    return { cpuPercent: cpu, memoryPercent: memory };
  } catch {
    return null;
  }
}

function findPidByPort(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const pid = Number.parseInt(output.split("\n")[0], 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function findPidByName(namePattern) {
  try {
    const output = execSync(`pgrep -f "${namePattern}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const pid = Number.parseInt(output.split("\n")[0], 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function summarize(samples) {
  if (!samples.length) {
    return { samples: 0, avgCpuPercent: null, maxCpuPercent: null, avgMemoryPercent: null, maxMemoryPercent: null };
  }

  const cpu = samples.map((s) => s.cpuPercent);
  const mem = samples.map((s) => s.memoryPercent);
  return {
    samples: samples.length,
    avgCpuPercent: cpu.reduce((a, b) => a + b, 0) / cpu.length,
    maxCpuPercent: Math.max(...cpu),
    avgMemoryPercent: mem.reduce((a, b) => a + b, 0) / mem.length,
    maxMemoryPercent: Math.max(...mem),
  };
}

export function createGateAProcessSampler({ localPort = 3100, intervalMs = 5000 } = {}) {
  const samples = { nextjs: [], k6: [] };
  let timer = null;
  let nextPid = null;
  let k6Pid = null;
  let unavailableReason = null;

  function sampleOnce() {
    nextPid = nextPid || findPidByPort(localPort);
    k6Pid = k6Pid || findPidByName("k6 run");

    const nextStats = readProcessStats(nextPid);
    const k6Stats = readProcessStats(k6Pid);
    if (nextStats) samples.nextjs.push(nextStats);
    if (k6Stats) samples.k6.push(k6Stats);
  }

  return {
    start() {
      try {
        sampleOnce();
        timer = setInterval(sampleOnce, intervalMs);
        timer.unref?.();
      } catch (error) {
        unavailableReason =
          error instanceof Error ? error.message : "Process sampling unavailable";
      }
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      sampleOnce();
    },
    getSummary() {
      if (unavailableReason) {
        return {
          available: false,
          reason: unavailableReason,
        };
      }

      const nextSummary = summarize(samples.nextjs);
      const k6Summary = summarize(samples.k6);

      if (nextSummary.samples === 0 && k6Summary.samples === 0) {
        return {
          available: false,
          reason: "Process sampling unavailable in this environment",
        };
      }

      return {
        available: true,
        nextjs: nextSummary,
        k6: k6Summary,
      };
    },
  };
}
