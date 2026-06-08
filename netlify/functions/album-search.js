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

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.results)) return value.results;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.albums)) return value.albums;
  if (Array.isArray(value.items)) return value.items;
  if (value.id || value.title || value.name) return [value];
  return [];
};

const levenshtein = (a, b) => {
  a = normalize(a);
  b = normalize(b);
  if (!a || !b) return a === b ? 1 : 0;
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  const distance = matrix[b.length][a.length];
  return 1 - distance / Math.max(a.length, b.length);
};

async function getJson(url) {
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'ArturMetalCollection/1.1 (+Netlify Function)'
    }
  });
  if (!res.ok) throw new Error(`Metal-API returned ${res.status} for ${url}`);
  return res.json();
}

const uniqueById = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.id || `${item.title || item.name}-${item.band?.name || item.band}-${item.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const params = event.queryStringParameters || {};
  const artist = (params.artist || '').trim();
  const title = (params.title || '').trim();
  const year = (params.year || '').trim();

  if (!title) return json(400, { error: 'Podaj tytuł albumu.' });

  try {
    const titleQueries = uniqueById([
      title,
      `${title}*`,
      normalize(title),
      `${normalize(title)}*`
    ].filter(Boolean).map((q) => ({ id: q })));

    const resultSets = await Promise.allSettled(
      titleQueries.map(({ id }) => getJson(`${API}/search/albums/title/${encodeURIComponent(id)}`))
    );

    const results = uniqueById(resultSets.flatMap((entry) => entry.status === 'fulfilled' ? asArray(entry.value) : []));

    const nArtist = normalize(artist);
    const nTitle = normalize(title);

    const ranked = results
      .map((item) => {
        const itemTitle = normalize(item.title || item.name || '');
        const itemBand = normalize(item.band?.name || item.band || '');
        const itemYear = yearFrom(item.date || item.releaseDate || '');
        const artistSimilarity = nArtist ? levenshtein(nArtist, itemBand) : 0;
        const titleSimilarity = levenshtein(nTitle, itemTitle);

        let score = 0;
        if (itemTitle === nTitle) score += 80;
        else if (itemTitle.includes(nTitle) || nTitle.includes(itemTitle)) score += 50;
        else if (titleSimilarity >= 0.82) score += Math.round(titleSimilarity * 45);

        if (nArtist && itemBand === nArtist) score += 90;
        else if (nArtist && (itemBand.includes(nArtist) || nArtist.includes(itemBand))) score += 55;
        else if (nArtist && artistSimilarity >= 0.75) score += Math.round(artistSimilarity * 70);

        if (year && itemYear === year) score += 35;
        if ((item.type || '').toLowerCase().includes('full')) score += 8;

        return { item, score, artistSimilarity, titleSimilarity };
      })
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]?.item;
    if (!best?.id) {
      return json(404, {
        error: 'Nie znaleziono albumu w Metal-API.',
        candidates: results.slice(0, 10)
      });
    }

    const album = await getJson(`${API}/albums/${encodeURIComponent(best.id)}`);
    const bandName = best.band?.name || artist;
    const tracks = asArray(album.songs).map((song, index) => ({
      number: song.number || String(index + 1).padStart(2, '0'),
      title: song.name || song.title || 'Untitled',
      length: song.length || ''
    }));

    const rawCoverUrl = album.coverUrl || '';
    const proxiedCoverUrl = rawCoverUrl
      ? `/.netlify/functions/cover-proxy?url=${encodeURIComponent(rawCoverUrl)}`
      : '';

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
      coverUrl: proxiedCoverUrl,
      originalCoverUrl: rawCoverUrl,
      tracks,
      matchedCandidate: ranked[0],
      candidates: ranked.slice(0, 8).map(({ item, score, artistSimilarity, titleSimilarity }) => ({
        ...item,
        score,
        artistSimilarity: Number(artistSimilarity.toFixed(2)),
        titleSimilarity: Number(titleSimilarity.toFixed(2))
      }))
    });
  } catch (error) {
    return json(502, {
      error: 'Nie udało się pobrać danych z Metal-API. Możesz dodać album ręcznie i uzupełnić tracklistę później.',
      details: error.message
    });
  }
};
