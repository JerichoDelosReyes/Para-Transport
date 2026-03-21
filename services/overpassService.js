/**
 * Overpass API Service for fetching public transit data in Cavite, Philippines.
 * Fetches bus, jeepney, share_taxi, ferry routes and bus stops from OpenStreetMap.
 *
 * Optimizations:
 * - Uses `out geom` to get geometry inline (avoids massive recursive way/node expansion)
 * - Splits routes and stops into two smaller queries
 * - Falls back across multiple Overpass mirrors
 * - AbortController with configurable timeout
 */

// Multiple Overpass API mirrors for redundancy
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Bounding box covering the whole Cavite province
const CAVITE_BBOX = '14.10,120.56,14.49,121.10';

const FETCH_TIMEOUT_MS = 40000; // 40 seconds

/**
 * Overpass QL query for transit route relations.
 * Uses `out geom` so geometry is embedded directly in member objects — no need for
 * the expensive `>;out skel qt;` recursive expansion that pulls hundreds of thousands of nodes.
 */
function buildRoutesQuery() {
  return `[out:json][timeout:90][maxsize:150000000];
(
  relation["route"="bus"](${CAVITE_BBOX});
  relation["route"="jeepney"](${CAVITE_BBOX});
  relation["route"="share_taxi"](${CAVITE_BBOX});
  relation["route"="minibus"](${CAVITE_BBOX});
);
out geom;`;
}

/**
 * Overpass QL query for bus/jeepney stop nodes.
 */
function buildStopsQuery() {
  return `[out:json][timeout:15];
node["highway"="bus_stop"](${CAVITE_BBOX});
out body;`;
}

/**
 * Attempts to fetch from each mirror in order until one succeeds.
 * @param {string} query  Overpass QL query string
 * @param {number} [timeoutMs]  Fetch timeout in ms
 * @returns {Promise<Object>} Parsed JSON response
 */
async function fetchFromMirrors(query, timeoutMs = FETCH_TIMEOUT_MS) {
  let lastError = null;

  for (const url of OVERPASS_MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Rate-limited or server error — try next mirror
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`${url}: HTTP ${response.status}`);
        continue;
      }

      if (!response.ok) {
        lastError = new Error(`${url}: HTTP ${response.status} ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      if (!data || !Array.isArray(data.elements)) {
        lastError = new Error(`${url}: Invalid response format`);
        continue;
      }

      return data;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      // Network error or timeout — try next mirror
      continue;
    }
  }

  throw lastError || new Error('All Overpass mirrors failed');
}

/**
 * Fetches transit route relations with inline geometry.
 * @returns {Promise<Object>} Overpass JSON with relation elements
 */
export async function fetchTransitRoutes() {
  return fetchFromMirrors(buildRoutesQuery());
}

/**
 * Fetches bus/jeepney stop nodes.
 * @returns {Promise<Object>} Overpass JSON with node elements
 */
export async function fetchTransitStops() {
  return fetchFromMirrors(buildStopsQuery(), 20000);
}

