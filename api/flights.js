// api/flights.js
export default async function handler(req, res) {
  // Querying open live ADS-B network centered over India (lat 22.5, lon 82.9, radius 1000 nautical miles)
  const url = 'https://api.adsb.lol/v2/point/22.5/82.9/1000';
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ states: [] });
    }

    const data = await response.json();
    const aircrafts = data.ac || [];
    
    // Map real-time ADS-B records into structured flight vectors
    const states = aircrafts.map(ac => [
      ac.hex || 'unknown',
      ac.flight ? ac.flight.trim() : 'N/A',
      'India Region',
      null,
      null,
      ac.lon || 0,
      ac.lat || 0,
      ac.alt_baro === 'ground' ? 0 : (typeof ac.alt_baro === 'number' ? ac.alt_baro * 0.3048 : 0), // feet to meters
      ac.gnd || false,
      typeof ac.gs === 'number' ? ac.gs * 0.514444 : 0, // knots to m/s
      ac.track || 0
    ]);

    // Enable CORS for your frontend and caching
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate');
    
    return res.status(200).json({ states });
  } catch (error) {
    return res.status(500).json({ states: [] });
  }
}
