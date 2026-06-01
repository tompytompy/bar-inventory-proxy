const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve the app ──
app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('index.html not found. Make sure it is in the same folder as server.js');
  }
  res.sendFile(filePath);
});

// ── Auth token cache ──
const tokenCache = {};

async function getToken(clientId, clientSecret) {
  const cached = tokenCache[clientId];
  if (cached && new Date() < new Date(cached.expires_at)) {
    return cached.access_token;
  }
  const res = await fetch('https://login.storyous.com/api/auth/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  tokenCache[clientId] = data;
  return data.access_token;
}

// ── Proxy GET ──
app.get('/storyous/*', async (req, res) => {
  const { cid, csec } = req.query;
  if (!cid || !csec) return res.status(400).json({ error: 'Missing cid or csec' });
  try {
    const token = await getToken(cid, csec);
    const apiPath = req.params[0];
    const qs = Object.entries(req.query)
      .filter(([k]) => k !== 'cid' && k !== 'csec')
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const url = `https://api.storyous.com/${apiPath}${qs ? '?' + qs : ''}`;
    const apiRes = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const text = await apiRes.text();
    res.status(apiRes.status).set('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Proxy POST ──
app.post('/storyous/*', async (req, res) => {
  const { cid, csec } = req.query;
  if (!cid || !csec) return res.status(400).json({ error: 'Missing cid or csec' });
  try {
    const token = await getToken(cid, csec);
    const apiPath = req.params[0];
    const url = `https://api.storyous.com/${apiPath}`;
    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    if (apiRes.status === 204) return res.status(204).send();
    const text = await apiRes.text();
    res.status(apiRes.status).set('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Debug route ──
app.get('/debug', (req, res) => {
  const files = fs.readdirSync(__dirname);
  res.json({ files, dirname: __dirname });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
