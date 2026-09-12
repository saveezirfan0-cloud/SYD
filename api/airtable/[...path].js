// Server-side Airtable proxy.
//
// The browser never sees the API key: it calls /api/airtable/<Table>[/<recordId>]
// and this function forwards the request to Airtable with the credential read
// from the AIRTABLE_KEY environment variable.
//
// Required Vercel environment variables:
//   AIRTABLE_KEY   personal access token (secret)
//   AIRTABLE_BASE  base id (optional, defaults to the app's base)

const AIRTABLE_API = 'https://api.airtable.com/v0';
const ALLOWED_TABLES = ['Users', 'Projects', 'Timesheets'];
const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];

module.exports = async (req, res) => {
  const key  = process.env.AIRTABLE_KEY;
  const base = process.env.AIRTABLE_BASE || 'appFGmCwiWShjFVrW';

  if (!key) {
    return res.status(500).json({ error: { message: 'AIRTABLE_KEY is not configured on the server' } });
  }
  if (!ALLOWED_METHODS.includes(req.method)) {
    res.setHeader('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const segments = [].concat(req.query.path || []);
  const [table, recordId, ...rest] = segments;

  if (!ALLOWED_TABLES.includes(table) || rest.length) {
    return res.status(404).json({ error: { message: 'Unknown Airtable path' } });
  }
  if (recordId && !/^rec[A-Za-z0-9]+$/.test(recordId)) {
    return res.status(400).json({ error: { message: 'Invalid record id' } });
  }

  // Forward the caller's query string (filterByFormula, offset, ...) untouched,
  // minus the catch-all route parameter Vercel injects.
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(req.query)) {
    if (name === 'path') continue;
    for (const v of [].concat(value)) query.append(name, v);
  }

  let url = `${AIRTABLE_API}/${base}/${encodeURIComponent(table)}`;
  if (recordId) url += `/${recordId}`;
  if ([...query].length) url += `?${query}`;

  const init = {
    method: req.method,
    headers: { Authorization: `Bearer ${key}` }
  };
  if (req.method === 'POST' || req.method === 'PATCH') {
    init.headers['Content-Type'] = 'application/json';
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  }

  try {
    const upstream = await fetch(url, init);
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ error: { message: 'Airtable request failed: ' + e.message } });
  }
};
