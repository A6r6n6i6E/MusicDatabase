exports.handler = async (event) => {
  const target = event.queryStringParameters?.url;
  if (!target) {
    return { statusCode: 400, body: 'Missing url' };
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return { statusCode: 400, body: 'Invalid url' };
  }

  const allowedHosts = new Set(['www.metal-archives.com', 'metal-archives.com']);
  if (!allowedHosts.has(parsed.hostname)) {
    return { statusCode: 403, body: 'Host not allowed' };
  }

  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'ArturMetalCollection/1.1 (+Netlify Function)',
        'Referer': 'https://www.metal-archives.com/'
      }
    });

    if (!response.ok) {
      return { statusCode: response.status, body: `Cover fetch failed: ${response.status}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800'
      },
      body: Buffer.from(arrayBuffer).toString('base64')
    };
  } catch (error) {
    return { statusCode: 502, body: error.message };
  }
};
