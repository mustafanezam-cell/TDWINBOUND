// netlify/functions/extract.js
// Serverless proxy: receives one document content block from the browser,
// asks Claude to extract structured inbound data, returns the JSON text.
// The Anthropic API key lives ONLY here, in the ANTHROPIC_API_KEY env var.

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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in Netlify environment variables' }) };

  let block;
  try { block = JSON.parse(event.body || '{}').block; }
  catch (e) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid request body' }) }; }
  if (!block) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'No document block provided' }) };

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: SYS_PROMPT,
        messages: [{ role: 'user', content: [block, { type: 'text', text: 'Extract this document as JSON per the schema.' }] }],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) ? data.error.message : ('Anthropic error ' + r.status);
      return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: msg }) };
    }
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    return { statusCode: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ text }) };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Upstream request failed: ' + e.message }) };
  }
};
