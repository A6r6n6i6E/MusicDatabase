const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    },
    body: JSON.stringify(body, null, 2)
  };
}

function env() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

function requireSupabase() {
  const cfg = env();
  if (!cfg.url || !cfg.key) {
    const err = new Error('Brakuje SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY. Dodaj je w Netlify Environment Variables.');
    err.status = 501;
    err.code = 'MISSING_SUPABASE_CONFIG';
    throw err;
  }
  return cfg;
}

async function supabaseFetch(path, options = {}) {
  const cfg = requireSupabase();
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'content-type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error((data && data.message) || `Supabase HTTP ${res.status}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

function parseBody(event) {
  try { return event.body ? JSON.parse(event.body) : {}; } catch { return {}; }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});

  try {
    if (event.httpMethod === 'GET') {
      const rows = await supabaseFetch('albums?select=id,album,created_at,updated_at&order=created_at.desc');
      const albums = (rows || []).map((row) => ({ id: row.id, ...(row.album || {}), createdAt: row.album?.createdAt || row.created_at, updatedAt: row.album?.updatedAt || row.updated_at }));
      return json(200, { ok: true, mode: 'cloud', albums });
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const album = body.album || body;
      if (!album || !album.id) return json(400, { ok: false, message: 'Brakuje obiektu album z polem id.' });
      album.updatedAt = new Date().toISOString();
      album.createdAt = album.createdAt || album.updatedAt;
      const rows = await supabaseFetch('albums', {
        method: 'POST',
        body: JSON.stringify({ id: album.id, album })
      });
      return json(200, { ok: true, album: rows?.[0]?.album || album });
    }

    if (event.httpMethod === 'PUT') {
      const body = parseBody(event);
      const id = body.id || body.album?.id;
      const album = body.album;
      if (!id || !album) return json(400, { ok: false, message: 'Brakuje id lub album.' });
      album.id = id;
      album.updatedAt = new Date().toISOString();
      const rows = await supabaseFetch(`albums?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ album, updated_at: album.updatedAt })
      });
      return json(200, { ok: true, album: rows?.[0]?.album || album });
    }

    if (event.httpMethod === 'DELETE') {
      const body = parseBody(event);
      const id = event.queryStringParameters?.id || body.id;
      if (!id) return json(400, { ok: false, message: 'Brakuje id albumu.' });
      await supabaseFetch(`albums?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return json(200, { ok: true, id });
    }

    return json(405, { ok: false, message: 'Metoda nieobsługiwana.' });
  } catch (error) {
    return json(error.status || 500, {
      ok: false,
      code: error.code || 'COLLECTION_ERROR',
      message: error.message || 'Błąd bazy kolekcji.',
      details: error.details || null
    });
  }
}
