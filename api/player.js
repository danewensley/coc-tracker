export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { tag } = req.query;
  if (!tag) return res.status(400).json({ error: 'Missing tag' });

  const apiKey = process.env.COC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const encoded = encodeURIComponent(tag);
  const upstream = await fetch(`https://api.clashofclans.com/v1/players/${encoded}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const data = await upstream.json();
  res.status(upstream.status).json(data);
}
