const DISCOGS_BASE = 'https://api.discogs.com';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300'
    },
    body: JSON.stringify(body, null, 2)
  };
}

function getHeaders() {
  const token = process.env.DISCOGS_TOKEN;
  const userAgent = process.env.DISCOGS_USER_AGENT || 'BibliotekaPlyt/4.0 +https://netlify.app';
  const headers = { 'User-Agent': userAgent, Accept: 'application/json' };
  if (token) headers.Authorization = `Discogs token=${token}`;
  return headers;
}

function cleanArtist(value = '') {
  return String(value).replace(/\s*\(\d+\)$/, '').trim();
}

function splitReleaseTitle(value = '') {
  const parts = String(value).split(' - ');
  if (parts.length >= 2) {
    return { artist: cleanArtist(parts[0]), title: parts.slice(1).join(' - ').trim() };
  }
  return { artist: '', title: String(value).trim() };
}

async function discogsFetch(params) {
  const url = new URL(`${DISCOGS_BASE}/database/search`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url, { headers: getHeaders() });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!res.ok) {
    const err = new Error(data.message || `Discogs HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function handler(event) {
  try {
    const qs = event.queryStringParameters || {};
    const q = (qs.q || '').trim();
    const kind = (qs.kind || 'release').trim();
    const artist = (qs.artist || '').trim();
    if (q.length < 3) return json(200, { ok: true, suggestions: [] });
    if (!process.env.DISCOGS_TOKEN) return json(200, { ok: true, suggestions: [], warning: 'MISSING_DISCOGS_TOKEN' });

    let search;
    if (kind === 'artist') {
      search = await discogsFetch({ type: 'artist', q, per_page: 8, page: 1 });
      const suggestions = (search.results || []).map((r) => ({
        id: r.id,
        kind: 'artist',
        label: cleanArtist(r.title),
        artist: cleanArtist(r.title),
        thumb: r.thumb || r.cover_image || ''
      }));
      return json(200, { ok: true, suggestions });
    }

    search = await discogsFetch({
      type: 'release',
      q: artist ? `${artist} ${q}` : q,
      artist,
      release_title: q,
      per_page: 10,
      page: 1
    });
    const suggestions = (search.results || []).map((r) => {
      const parsed = splitReleaseTitle(r.title);
      return {
        id: r.id,
        kind: 'release',
        label: `${r.title}${r.year ? ` (${r.year})` : ''}${r.country ? ` • ${r.country}` : ''}`,
        artist: parsed.artist || artist,
        title: parsed.title,
        year: r.year || '',
        country: r.country || '',
        format: Array.isArray(r.format) ? r.format.join(', ') : r.format || '',
        thumb: r.thumb || r.cover_image || ''
      };
    });
    return json(200, { ok: true, suggestions });
  } catch (error) {
    return json(error.status || 500, { ok: false, message: error.message || 'Błąd autouzupełniania Discogs.', details: error.data || null });
  }
}
