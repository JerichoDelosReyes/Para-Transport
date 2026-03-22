require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // bypassing RLS for seeding
const supabase = createClient(supabaseUrl, supabaseKey);

const routesData = JSON.parse(fs.readFileSync('data/routes.json', 'utf8'));

async function importRoutes() {
  console.log(`Starting import for ${routesData.routes.length} routes...`);

  for (const item of routesData.routes) {
    const { code, name, type, fare, stops, path, description, operator, status } = item;
    console.log(`\nProcessing: ${name} (${code})`);

    // 1. Upsert Route (keyed by route_code)
    const { data: routeInsert, error: routeError } = await supabase
      .from('routes')
      .upsert({
        route_code: code,
        name: name,
        description: description || '',
        operator: operator || '',
        status: status || 'active',
        vehicle_type: type,
        fare_base: fare || 13,
        path_data: path || [],
        is_active: true,
      }, { onConflict: 'route_code' })
      .select('id')
      .single();

    if (routeError) {
      console.error(`Error upserting route ${code}:`, routeError.message);
      continue;
    }

    const routeId = routeInsert.id;
    console.log(` - Upserted route with ID: ${routeId}`);

    // 2. Delete old stops then re-insert (handles path changes on re-import)
    if (stops && stops.length > 0) {
      const { error: deleteErr } = await supabase
        .from('route_stops')
        .delete()
        .eq('route_id', routeId);

      if (deleteErr) {
        console.error(`   Error deleting old stops for ${code}:`, deleteErr.message);
      }

      const stopsPayload = stops.map((s, idx) => ({
        route_id: routeId,
        stop_name: s.name,
        latitude: s.lat,
        longitude: s.lng,
        stop_order: idx + 1
      }));

      const { error: stopsError } = await supabase
        .from('route_stops')
        .insert(stopsPayload);

      if (stopsError) {
         console.error(`   Error inserting stops for ${code}:`, stopsError.message);
      } else {
         console.log(` - Inserted ${stops.length} physical stops`);
      }
    }
  }

  console.log('\nImport successfully finished.');
}

importRoutes().catch(console.error);