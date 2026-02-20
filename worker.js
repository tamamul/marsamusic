// =============================================
// MARSA MUSIC - Cloudflare Worker
// Proxy Invidious tanpa CORS issue
// =============================================

const INVIDIOUS_INSTANCES = [
  'https://invidious.nerdvpn.de',    // paling stabil
  'https://inv.nadeko.net',          // backup
  'https://invidious.privacyredirect.com' // backup
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const videoId = url.searchParams.get('id');

    if (!videoId) {
      return new Response(JSON.stringify({ error: 'Parameter ?id= wajib diisi' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Coba tiap instance sampai berhasil
    let lastError = '';
    for (const instance of INVIDIOUS_INSTANCES) {
      try {
        const apiUrl = `${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`;
        const res = await fetch(apiUrl, {
  headers: { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
  },
  signal: AbortSignal.timeout(12000), // timeout sedikit lebih lama
});

        if (!res.ok) {
          lastError = `${instance} → HTTP ${res.status}`;
          continue;
        }

        const data = await res.json();

        // Cari audio only stream
        const audioFormats = (data.adaptiveFormats || [])
          .filter(f => f.type?.startsWith('audio/') && f.url);

        const best = audioFormats.find(f => f.type.includes('opus'))
                  || audioFormats.find(f => f.type.includes('mp4a'))
                  || audioFormats[0];

        if (best) {
          return new Response(JSON.stringify({
            url: best.url,
            type: best.type,
            instance: instance,
          }), {
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }

        // Fallback: formatStreams (ada video tapi audio bisa diplay)
        const fs = data.formatStreams || [];
        if (fs.length) {
          return new Response(JSON.stringify({
            url: fs[fs.length - 1].url,
            type: fs[fs.length - 1].type,
            instance: instance,
            fallback: true,
          }), {
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }

        lastError = `${instance} → no audio stream`;

      } catch (e) {
        lastError = `${instance} → ${e.message}`;
        continue;
      }
    }

    return new Response(JSON.stringify({
      error: 'Semua instance gagal',
      detail: lastError,
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
};
