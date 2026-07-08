// Appwrite Function: extract (Node 18+, ESM). Port of the Netlify function.
// Env var required: ANTHROPIC_API_KEY
const SYS_PROMPT = `You extract structured logistics data from a SINGLE supplier or transport document for a marine-spares freight forwarder (Rhenus / Tidewater).

Classify the document as ONE docType:
- "commercial_invoice", "cpl" (combined packing list), or "packing_list" -> contains PO line items
- "dhl_invoice" -> a courier/transport invoice with a transport cost and an air waybill (AWB) number
- "msds", "sds", or "test_report" -> a dangerous-goods safety/test document
- "unknown" -> anything else

Return ONLY a JSON object, no prose, no markdown fences. Schema:
{
 "docType": "...",
 "pickup": { "awb": string|null, "transportCost": number|null, "transportCurrency": string|null },
 "pos": [
   {
     "poNumber": string,
     "supplier": string|null,
     "dg": boolean,
     "measurements": { "weightKg": number|null, "dims": string|null, "pieces": number|null },
     "lines": [ { "description": string, "qty": number|null, "hsCode": string|null, "coo": string|null } ]
   }
 ],
 "dgDoc": { "forPO": string|null, "productName": string|null }
}
Rules: "pickup" only for dhl_invoice (else null). "pos" only for commercial_invoice/cpl/packing_list (else []). "dgDoc" only for msds/sds/test_report (else null). Extract only what is actually written. Never invent HS codes or COO. If HS or COO is missing on a line, use null. COO must be a 2-letter country code if determinable. weightKg/dims/pieces belong to the whole shipment/document, not to a line. If a value is absent, use null.`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export default async ({ req, res }) => {
  if (req.method === 'OPTIONS') return res.text('', 204, CORS);
  if (req.method !== 'POST') return res.json({ error: 'Method not allowed' }, 405, CORS);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.json({ error: 'ANTHROPIC_API_KEY not set in function variables' }, 500, CORS);

  let block;
  try { block = JSON.parse(req.bodyRaw || req.body || '{}').block; }
  catch (e) { return res.json({ error: 'Invalid request body' }, 400, CORS); }
  if (!block) return res.json({ error: 'No document block provided' }, 400, CORS);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: SYS_PROMPT,
        messages: [{ role: 'user', content: [block, { type: 'text', text: 'Extract this document as JSON per the schema.' }] }],
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.json({ error: data?.error?.message || ('Anthropic error ' + r.status) }, r.status, CORS);
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    return res.json({ text }, 200, { ...CORS, 'content-type': 'application/json' });
  } catch (e) {
    return res.json({ error: 'Upstream request failed: ' + e.message }, 502, CORS);
  }
};
