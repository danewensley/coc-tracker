exports.handler = async function (event) {
  const tag = event.queryStringParameters && event.queryStringParameters.tag;
  if (!tag) return { statusCode: 400, body: JSON.stringify({ error: 'Missing tag' }) };

  const apiKey = process.env.COC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };

  const encoded = encodeURIComponent(tag);
  const res = await fetch(`https://api.clashofclans.com/v1/players/${encoded}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const data = await res.json();
  return {
    statusCode: res.status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(data),
  };
};
