import { initializeGraph } from './GraphBuilder';
import { hydrateFareMatrices } from './FareCalculator';

let initializationPromise: Promise<void> | null = null;
let initialized = false;

export async function ensureRoutingRuntimeInitialized(): Promise<void> {
  if (initialized) {
    return;
  }

  if (!initializationPromise) {
    initializationPromise = (async () => {
      console.log('[RoutingRuntime] Initialization started');
      await initializeGraph();
      await hydrateFareMatrices();
      initialized = true;
      console.log('[RoutingRuntime] Initialization completed');
    })().catch((error) => {
      initialized = false;
      initializationPromise = null;
      console.error('[RoutingRuntime] Initialization failed', error);
      throw error;
    });
  }

  await initializationPromise;
}
