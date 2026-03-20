const fs = require('fs');

const CAVITE_BBOX = '14.10,120.56,14.49,121.10';

const qRoutes = `[out:json][timeout:90][maxsize:150000000];
(
  relation["route"="bus"](${CAVITE_BBOX});
  relation["route"="jeepney"](${CAVITE_BBOX});
  relation["route"="share_taxi"](${CAVITE_BBOX});
  relation["route"="minibus"](${CAVITE_BBOX});
);
out geom;`;

const qStops = `[out:json][timeout:15];
node["highway"="bus_stop"](${CAVITE_BBOX});
out body;`;

async function fetchAll() {
  console.log('Fetching raw routes from Overpass API...');
  const resR = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: 'data=' + encodeURIComponent(qRoutes)
  });
  const dataR = await resR.json();
  console.log('Routes fetched:', dataR.elements.length);

  console.log('Fetching raw stops from Overpass API...');
  const resS = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: 'data=' + encodeURIComponent(qStops)
  });
  const dataS = await resS.json();
  console.log('Stops fetched:', dataS.elements.length);

  // We temporarily save the raw elements
  fs.writeFileSync('data/temp_overpass_cache.json', JSON.stringify({
    routeElements: dataR.elements,
    stopElements: dataS.elements
  }));
  console.log('\nSaved raw cache. Calling dynamic parser...');

  // Parse using our app logic so the file size goes from 60MB down to ~1MB
  import('../utils/parseRoutes.js').then(module => {
    const rawData = JSON.parse(fs.readFileSync('data/temp_overpass_cache.json', 'utf8'));
    console.log('Parsing routes (clipping bounds, interpolating coordinates)...');
    const routes = module.parseRouteElements(rawData.routeElements);
    
    console.log('Parsing stops...');
    const stops = module.parseStopElements(rawData.stopElements);
    
    const finalPayload = { routes, stops, version: Date.now() };
    const finalStr = JSON.stringify(finalPayload);
    fs.writeFileSync('data/parsed_transit_data.json', finalStr);
    
    console.log(`\n🎉 Success! Saved parsed data to data/parsed_transit_data.json.`);
    console.log(`Final file size: ${(finalStr.length / 1024).toFixed(2)} KB (bundled statically into the app)`);
    
    // Clean up
    fs.unlinkSync('data/temp_overpass_cache.json');
  }).catch(console.error);
}

fetchAll().catch(console.error);
