const API = 'https://metal-api.dev';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=3600'
  },
  body: JSON.stringify(body)
});

const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const yearFrom = (value = '') => {
  const match = String(value).match(/(19|20)\d{2}/);
  return match ? match[0] : '';
};

async function getJson(url) {
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'PrivateCollectionApp/1.0 (+Netlify Function)'
    }
  });
  if (!res.ok) {
    throw new Error(`Metal-API returned ${res.status}`);
  }
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const params = event.queryStringParameters || {};
  const artist = (params.artist || '').trim();
  const title = (params.title || '').trim();
  const year = (params.year || '').trim();

  if (!title) return json(400, { error: 'Podaj tytuł albumu.' });

  try {
    const searchTerm = encodeURIComponent(`${title}*`);
    const resultsRaw = await getJson(`${API}/search/albums/title/${searchTerm}`);
    const results = Array.isArray(resultsRaw) ? resultsRaw : [resultsRaw].filter(Boolean);

    const nArtist = normalize(artist);
    const nTitle = normalize(title);
    const ranked = results
      .map((item) => {
        const itemTitle = normalize(item.title || item.name || '');
        const itemBand = normalize(item.band?.name || item.band || '');
        const itemYear = yearFrom(item.date || item.releaseDate || '');
        let score = 0;
        if (itemTitle === nTitle) score += 60;
        else if (itemTitle.includes(nTitle) || nTitle.includes(itemTitle)) score += 35;
        if (nArtist && itemBand === nArtist) score += 60;
        else if (nArtist && (itemBand.includes(nArtist) || nArtist.includes(itemBand))) score += 35;
        if (year && itemYear === year) score += 25;
        return { item, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]?.item || results[0];
    if (!best?.id) {
      return json(404, { error: 'Nie znaleziono albumu w Metal-API.', candidates: results.slice(0, 10) });
    }

    const album = await getJson(`${API}/albums/${encodeURIComponent(best.id)}`);
    const bandName = best.band?.name || artist;
    const tracks = (album.songs || []).map((song, index) => ({
      number: song.number || String(index + 1).padStart(2, '0'),
      title: song.name || song.title || 'Untitled',
      length: song.length || ''
    }));

    return json(200, {
      source: 'Metal-API / Metal Archives',
      metalArchivesId: album.id || best.id,
      metalArchivesLink: best.link || null,
      artist: bandName,
      title: album.name || best.title || title,
      year: yearFrom(album.releaseDate || best.date || year),
      releaseDate: album.releaseDate || best.date || '',
      albumType: album.type || best.type || '',
      label: album.label || '',
      format: album.format || '',
      coverUrl: album.coverUrl || '',
      tracks,
      candidates: ranked.slice(0, 8).map(({ item, score }) => ({ ...item, score }))
    });
  } catch (error) {
    return json(502, {
      error: 'Nie udało się pobrać danych z Metal-API. Możesz dodać album ręcznie i uzupełnić tracklistę później.',
      details: error.message
    });
  }
};
