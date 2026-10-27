// api/flights.js
export default async function handler(req, res) {
  // Real-time flight state vectors bounding box covering the Indian regional airspace
  const url = 'https://opensky-network.org/api/states/all?lamin=6.5&lamax=35.5&lomin=68.1&lomax=97.4';
  
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
    
    // Enable CORS for your GitHub Pages frontend domain
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate');
    
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ states: [] });
  }
}
