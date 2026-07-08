// Appwrite Function: translate EN → FR for CI lines (Node 18+, ESM).
// Env var required: ANTHROPIC_API_KEY
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export default async ({ req, res }) => {
  if (req.method === 'OPTIONS') return res.text('', 204, CORS);
  if (req.method !== 'POST') return res.json({ error: 'POST only' }, 405, CORS);
  try {
    const { texts } = JSON.parse(req.bodyRaw || req.body || '{}');
    if (!Array.isArray(texts) || !texts.length) return res.json({ error: 'texts[] required' }, 400, CORS);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content:
          'Translate each of these English marine spare-part descriptions to French for a commercial invoice. ' +
          'Keep part numbers, brand names and codes unchanged. ' +
          'Reply ONLY with a JSON array of strings, same order and length, no markdown.\n\n' + JSON.stringify(texts) }],
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.json({ error: data?.error?.message || 'API error' }, r.status, CORS);
    const raw = (data.content || []).map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    const translations = JSON.parse(raw);
    if (!Array.isArray(translations) || translations.length !== texts.length) throw new Error('bad translation shape');
    return res.json({ translations }, 200, CORS);
  } catch (e) {
    return res.json({ error: String(e.message || e) }, 500, CORS);
  }
};
