// EN → FR translation for CI line descriptions (technical marine spare-part terms).
// Uses the same ANTHROPIC_API_KEY env var as extract.js.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };

  try {
    const { texts } = JSON.parse(event.body || '{}');
    if (!Array.isArray(texts) || !texts.length) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'texts[] required' }) };
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content:
            'Translate each of these English marine spare-part descriptions to French for a commercial invoice. ' +
            'Keep part numbers, brand names and codes unchanged. ' +
            'Reply ONLY with a JSON array of strings, same order and length, no markdown.\n\n' +
            JSON.stringify(texts),
        }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, headers: CORS, body: JSON.stringify({ error: data.error?.message || 'API error' }) };
    const raw = (data.content || []).map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    const translations = JSON.parse(raw);
    if (!Array.isArray(translations) || translations.length !== texts.length) throw new Error('bad translation shape');
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ translations }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
