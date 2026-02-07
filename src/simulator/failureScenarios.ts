/**
 * Failure Scenarios - Injection system for simulating upload failures
 */

import { FailureConfig, FailureType } from './types';

export interface FailureCheck {
  shouldFail: boolean;
  failureType: FailureType | null;
  message: string;
}

export interface FailureScenarioEngine {
  config: FailureConfig;
  networkDown: boolean;
  manualFailureQueue: FailureType[];
}

export function createFailureEngine(): FailureScenarioEngine {
  return {
    config: {},
    networkDown: false,
    manualFailureQueue: [],
  };
}

export function setFailureConfig(
  engine: FailureScenarioEngine,
  config: FailureConfig
): FailureScenarioEngine {
  return {
    ...engine,
    config: { ...config },
  };
}

export function queueManualFailure(
  engine: FailureScenarioEngine,
  type: FailureType
): FailureScenarioEngine {
  return {
    ...engine,
    manualFailureQueue: [...engine.manualFailureQueue, type],
  };
}

export function setNetworkDown(
  engine: FailureScenarioEngine,
  down: boolean
): FailureScenarioEngine {
  return {
    ...engine,
    networkDown: down,
  };
}

export function checkForFailure(
  engine: FailureScenarioEngine,
  currentChunk: number,
  totalChunks: number
): { engine: FailureScenarioEngine; check: FailureCheck } {
  // Check manual failure queue first
  if (engine.manualFailureQueue.length > 0) {
    const [failure, ...rest] = engine.manualFailureQueue;
    return {
      engine: { ...engine, manualFailureQueue: rest },
      check: {
        shouldFail: true,
        failureType: failure,
        message: `Manual failure triggered: ${failure}`,
      },
    };
  }

  // Check if network is down
  if (engine.networkDown) {
    return {
      engine,
      check: {
        shouldFail: true,
        failureType: 'network_drop',
        message: 'Network is down',
      },
    };
  }

  const { config } = engine;
  const progress = (currentChunk / totalChunks) * 100;

  // Check network drop at percentage
  if (
    config.networkDropAtPercent !== undefined &&
    progress >= config.networkDropAtPercent &&
    !engine.networkDown
  ) {
    return {
      engine: { ...engine, networkDown: true },
      check: {
        shouldFail: true,
        failureType: 'network_drop',
        message: `Network dropped at ${progress.toFixed(1)}% (threshold: ${config.networkDropAtPercent}%)`,
      },
    };
  }

  // Check chunk failure every N
  if (
    config.chunkFailureEveryN !== undefined &&
    config.chunkFailureEveryN > 0 &&
    currentChunk % config.chunkFailureEveryN === 0
  ) {
    return {
      engine,
      check: {
        shouldFail: true,
        failureType: 'chunk_failure',
        message: `Chunk ${currentChunk} failed (every ${config.chunkFailureEveryN} chunks)`,
      },
    };
  }

  // No failure
  return {
    engine,
    check: {
      shouldFail: false,
      failureType: null,
      message: '',
    },
  };
}

export function getLatencySpike(config: FailureConfig): number {
  if (!config.latencySpikeMs || config.latencySpikeMs <= 0) {
    return 0;
  }
  
  // 30% chance of latency spike
  if (Math.random() > 0.3) {
    return 0;
  }

  // Random spike between 50% and 100% of configured max
  return Math.floor(config.latencySpikeMs * (0.5 + Math.random() * 0.5));
}

export function shouldSimulateBrowserRefresh(config: FailureConfig): boolean {
  return config.simulateBrowserRefresh === true;
}
