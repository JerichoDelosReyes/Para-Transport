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
    const { code, name, type, fare, stops, path } = item;
    console.log(`\nProcessing: ${name} (${code})`);

    const colors = {
      jeepney: '#E8A020',
      tricycle: '#4285F4',
      uv_express: '#34A853',
      bus: '#EA4335',
      lrt: '#9C27B0'
    };

    // Calculate approx total distance from the last stop mapping if we want, or just default.
    // For now we'll just insert what we mathematically have in the schema.
    
    // 1. Insert or get terminals. Use the first and last stop as the origin/destination.
    let originTerminalId = null;
    let destTerminalId = null;

    if (stops && stops.length >= 2) {
      const origin = stops[0];
      const dest = stops[stops.length - 1];

      // Upsert Origin Terminal
      const { data: o_data, error: o_err } = await supabase
        .from('terminals')
        .insert({
           name: origin.name,
           city: "Cavite", // generic default since we don't know the specific city programmatically
           latitude: origin.lat,
           longitude: origin.lng
        })
        .select('id')
        .single();
      if (o_err) console.log("Term insert err:", o_err.message);
      if (o_data) originTerminalId = o_data.id;

      // Upsert Dest Terminal
      const { data: d_data, error: d_err } = await supabase
        .from('terminals')
        .insert({
           name: dest.name,
           city: "Cavite",
           latitude: dest.lat,
           longitude: dest.lng
        })
        .select('id')
        .single();
      if (d_err) console.log("Term insert err:", d_err.message);
      if (d_data) destTerminalId = d_data.id;
    }

    // 2. Insert Route
    const { data: routeInsert, error: routeError } = await supabase
      .from('routes')
      .insert({
        route_code: code,
        name: name,
        vehicle_type_id: type,
        fare_base: fare || 13,
        color_hex: colors[type] || '#E8A020',
        path_data: path || [], // The huge polyline array
        is_active: true,
        origin_terminal_id: originTerminalId,
        destination_terminal_id: destTerminalId
      })
      .select('id')
      .single();

    if (routeError) {
      console.error(`Error inserting route ${code}:`, routeError.message);
      continue;
    }

    const routeId = routeInsert.id;
    console.log(` - Inserted route with ID: ${routeId}`);

    // 3. Insert specific physical stops
    if (stops && stops.length > 0) {
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