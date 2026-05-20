// Testing built-in fetch in Node 24

const BASE_URL = 'https://fleetapi-me.cartrack.com/rest';
const API_KEY = 'RlVKQTAwMDA0OmNmNDI4YjY0YzQ5ZmI3ODBkZmMzYjQzODdlMzVlYjM2NTZlNzVhOGI5YzUxODcwYzAwNTNhMGUwNjcwYjY4ZmU=';

async function testAuth() {
  const variations = [
    { name: 'Basic Base64(key)', headers: { 'Authorization': `Basic ${Buffer.from(API_KEY).toString('base64')}` } },
    { name: 'Basic Base64(key:)', headers: { 'Authorization': `Basic ${Buffer.from(API_KEY + ':').toString('base64')}` } },
    { name: 'Basic key directly', headers: { 'Authorization': `Basic ${API_KEY}` } },
    { name: 'Bearer key', headers: { 'Authorization': `Bearer ${API_KEY}` } },
    { name: 'X-Api-Key header', headers: { 'X-Api-Key': API_KEY } },
    { name: 'Query param api_key', url: `${BASE_URL}/vehicles?limit=1&api_key=${API_KEY}`, headers: {} },
  ];

  for (const v of variations) {
    console.log(`Testing ${v.name}...`);
    try {
      const dateTo = '2026-05-04 23:59:59';
      const dateFrom = '2026-04-27 00:00:00';
      const url = v.url || `${BASE_URL}/trips?start_timestamp=${encodeURIComponent(dateFrom)}&end_timestamp=${encodeURIComponent(dateTo)}&limit=1000`;

      const res = await fetch(url, { headers: { ...v.headers, 'Accept': 'application/json' } });
      console.log(`  Status: ${res.status}`);
      if (res.status === 422 || res.status === 401) {
        const body = await res.text();
        console.log(`  Body: ${body}`);
      }
      if (res.ok) {

        const result = await res.json();
        console.log(`  Total Trips Found (7D): ${result.data?.length}`);
        console.log(`  Sample Trip:`, JSON.stringify(result.data?.[0], null, 2));

        console.log(`  SUCCESS with ${v.name}!`);
        break;
      }



    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }

  }
}


testAuth();
