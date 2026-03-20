import { initializeGraph } from './GraphBuilder';
import { hydrateFareMatrices } from './FareCalculator';

let initializationPromise: Promise<void> | null = null;
let initialized = false;
let lastFailureAtMs: number | null = null;
let lastFailureMessage: string | null = null;

const INITIALIZATION_RETRY_COOLDOWN_MS = 30_000;

export type RoutingRuntimeMode = 'GRAPH' | 'FALLBACK';

export type RoutingRuntimeStatus = {
  initialized: boolean;
  inCooldown: boolean;
  cooldownRemainingMs: number;
  lastFailureAtMs: number | null;
  lastFailureMessage: string | null;
};

export function getRoutingRuntimeStatus(): RoutingRuntimeStatus {
  const now = Date.now();
  const elapsedSinceFailure = lastFailureAtMs ? now - lastFailureAtMs : Number.POSITIVE_INFINITY;
  const inCooldown = !initialized && elapsedSinceFailure < INITIALIZATION_RETRY_COOLDOWN_MS;
  const cooldownRemainingMs = inCooldown ? INITIALIZATION_RETRY_COOLDOWN_MS - elapsedSinceFailure : 0;

  return {
    initialized,
    inCooldown,
    cooldownRemainingMs,
    lastFailureAtMs,
    lastFailureMessage,
  };
}

export async function ensureRoutingRuntimeInitialized(): Promise<void> {
  if (initialized) {
    return;
  }

  const status = getRoutingRuntimeStatus();
  if (status.inCooldown) {
    const cooldownMessage = `Routing runtime initialization in cooldown for ${Math.ceil(
      status.cooldownRemainingMs / 1000
    )}s`;
    console.warn(`[RoutingRuntime] ${cooldownMessage}`);
    throw new Error(lastFailureMessage || cooldownMessage);
  }

  if (!initializationPromise) {
    initializationPromise = (async () => {
      console.log('[RoutingRuntime] Initialization started');
      await initializeGraph();
      await hydrateFareMatrices();
      initialized = true;
      lastFailureAtMs = null;
      lastFailureMessage = null;
      console.log('[RoutingRuntime] Initialization completed');
    })().catch((error) => {
      initialized = false;
      lastFailureAtMs = Date.now();
      lastFailureMessage = error instanceof Error ? error.message : String(error);
      initializationPromise = null;
      console.error('[RoutingRuntime] Initialization failed', error);
      throw error;
    });
  }

  await initializationPromise;
}
