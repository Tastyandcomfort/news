// api/flights.js (Hosted on your Vercel deployment)
export default async function handler(req, res) {
  // Bounding box roughly covering India (min/max latitude and longitude)
  const url = 'https://opensky-network.org/api/states/all?lamin=6.5&lamax=35.5&lomin=68.1&lomax=97.4';
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allows your GitHub Pages site to read it freely
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch flight data' });
  }
}
