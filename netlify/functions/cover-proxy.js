export async function handler(event) {
  const url = event.queryStringParameters?.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    return { statusCode: 400, body: 'Missing image url' };
  }
  try {
    const headers = {
      'User-Agent': process.env.DISCOGS_USER_AGENT || 'BibliotekaPlyt/3.0 +https://netlify.app',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    };
    if (process.env.DISCOGS_TOKEN) headers.Authorization = `Discogs token=${process.env.DISCOGS_TOKEN}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return { statusCode: res.status, body: 'Image fetch failed' };
    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    return {
      statusCode: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=86400'
      },
      body: Buffer.from(arrayBuffer).toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    return { statusCode: 500, body: err.message || 'Proxy error' };
  }
}
