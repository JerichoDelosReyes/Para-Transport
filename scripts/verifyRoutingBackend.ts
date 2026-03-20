import { getSupabaseClient } from '../services/GraphBuilder';
import { ensureRoutingRuntimeInitialized, getRoutingRuntimeStatus } from '../services/RoutingRuntime';
import { searchTransitRoutes } from '../services/transitSearch';

async function run(): Promise<void> {
  console.log('=== Routing Backend Verification ===');

  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (or server equivalents).'
    );
  }

  console.log('[1/4] Env check: OK');

  const supabase = getSupabaseClient();

  const [networkCount, transferCount, fareCount] = await Promise.all([
    supabase.from('network_transit_geo').select('*', { count: 'exact', head: true }),
    supabase.from('transfer_nodes_geo').select('*', { count: 'exact', head: true }),
    supabase.from('fare_matrices').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  if (networkCount.error) {
    throw new Error(`network_transit_geo check failed: ${networkCount.error.message}`);
  }

  if (transferCount.error) {
    throw new Error(`transfer_nodes_geo check failed: ${transferCount.error.message}`);
  }

  if (fareCount.error) {
    throw new Error(`fare_matrices check failed: ${fareCount.error.message}`);
  }

  console.log(
    `[2/4] Supabase read check: OK | network=${networkCount.count ?? 0} transfer=${transferCount.count ?? 0} activeFares=${fareCount.count ?? 0}`
  );

  await ensureRoutingRuntimeInitialized();
  const runtime = getRoutingRuntimeStatus();

  if (!runtime.initialized) {
    throw new Error(
      `Routing runtime did not initialize. inCooldown=${runtime.inCooldown} lastFailure=${runtime.lastFailureMessage ?? 'none'}`
    );
  }

  console.log('[3/4] Graph + fare hydration: OK');

  const result = await searchTransitRoutes({
    originQuery: 'BDO',
    destinationQuery: 'District',
    currentLocation: null,
  });

  if (!result.options.length) {
    throw new Error('Search returned zero options for sanity scenario (BDO -> District).');
  }

  const top = result.options[0];
  console.log(
    `[4/4] Search pipeline: OK | options=${result.options.length} top="${top.title}" fare=P${top.totalFare.toFixed(2)} eta=${top.estimatedMinutes}m transfers=${top.transferCount}`
  );

  console.log('VERDICT: PASS (Supabase + Graph + Search are connected)');
}

run().catch((error) => {
  console.error('VERDICT: FAIL');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
