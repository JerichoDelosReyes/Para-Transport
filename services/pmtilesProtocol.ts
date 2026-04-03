import { Protocol } from 'pmtiles';

declare global {
  // Singleton guard during fast refresh.
  var __paraPmtilesProtocol: Protocol | undefined;
}

const PMTILES_PROTOCOL_SCHEME = 'pmtiles://';

let hasLoggedBootstrap = false;

export function ensurePmtilesProtocol(): Protocol {
  if (!globalThis.__paraPmtilesProtocol) {
    globalThis.__paraPmtilesProtocol = new Protocol({
      metadata: true,
      errorOnMissingTile: false,
    });
  }

  if (!hasLoggedBootstrap) {
    hasLoggedBootstrap = true;
    console.log(
      `[MapLibre] PMTiles protocol bootstrap initialized. Use ${PMTILES_PROTOCOL_SCHEME} URLs in style sources when supported by native bridge.`
    );
  }

  return globalThis.__paraPmtilesProtocol;
}
