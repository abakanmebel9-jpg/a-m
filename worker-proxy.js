// ============================================================
// ABAKANMEBEL Cloudflare Worker — Reverse Proxy to GitHub Pages
// ============================================================
// VERSION: 1.0
// ARCHITECTURE: GitHub Pages (static) -> Cloudflare Worker (proxy) -> Client
// The worker acts as a reverse proxy to GitHub Pages for all HTML/CSS/JS/JSON content
// and handles /m/{hash} media proxy requests directly.
// ============================================================

const CONFIG = {
  SITE_URL: 'https://abakanmebel.online',
  LOGO_URL: 'https://i.pinimg.com/736x/99/d6/71/99d67109954a1bc4102f2142a82d2de7.jpg',
  GITHUB_PAGES_URL: 'https://abakanmebel9-jpg.github.io/a-m',
  GITHUB_JSON_URL: 'https://raw.githubusercontent.com/abakanmebel9-jpg/a-m/main/data/cached_posts.json',
  GITHUB_MEDIA_MAP_URL: 'https://raw.githubusercontent.com/abakanmebel9-jpg/a-m/main/data/media_map.json',
  MEDIA_CACHE_TTL: 2592000, // 30 days
  HTML_CACHE_TTL: 7200,    // 2 hours
  LOGO_CACHE_TTL: 604800,  // 7 days
  FETCH_TIMEOUT_MS: 10000,
  MAX_RETRIES: 2
};

// ============================================================
// GLOBAL STATE
// ============================================================
let mediaHashMap = new Map();
let logoCache = { data: null, timestamp: 0, ttl: CONFIG.LOGO_CACHE_TTL };

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function generateMediaHash(url) {
  if (!url || typeof url !== 'string') return '0';
  let hash = 2166136261;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}

async function fetchWithTimeout(url, options = {}, timeout = CONFIG.FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ============================================================
// SECURITY HEADERS
// ============================================================
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: blob:; img-src 'self' https: data: blob: pinimg.com i.pinimg.com t.me telegram.org githubusercontent.com raw.githubusercontent.com cdn.ampproject.org fonts.googleapis.com fonts.gstatic.com www.googletagmanager.com cdninstagram.com fbcdn.net scontent.cdninstagram.com; media-src 'self' https: blob: t.me telegram.org; connect-src 'self' https: www.googletagmanager.com; frame-src 'self' https: t.me telegram.org www.instagram.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: www.googletagmanager.com; style-src 'self' 'unsafe-inline' https:; font-src 'self' https:;",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'unsafe-none'
};

// ============================================================
// GITHUB PAGES PROXY
// ============================================================
async function proxyToGitHubPages(request, path) {
  try {
    // Determine the GitHub Pages URL
    let ghUrl;
    if (path === '/' || path === '/index.html') {
      ghUrl = CONFIG.GITHUB_PAGES_URL + '/index.html';
    } else if (path.endsWith('/')) {
      ghUrl = CONFIG.GITHUB_PAGES_URL + path + 'index.html';
    } else if (path.match(/\.(html|css|js|json|xml|txt|ico|png|jpg|svg)$/)) {
      ghUrl = CONFIG.GITHUB_PAGES_URL + path;
    } else {
      // Try with /index.html first (for directory-style URLs)
      ghUrl = CONFIG.GITHUB_PAGES_URL + path + '/index.html';
    }

    const response = await fetchWithTimeout(ghUrl, {
      headers: {
        'User-Agent': 'AbakanMebel-Proxy/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });

    if (!response.ok) {
      // If directory-style failed, try direct path
      if (!path.match(/\.\w+$/)) {
        const directUrl = CONFIG.GITHUB_PAGES_URL + path;
        const directResponse = await fetchWithTimeout(directUrl, {
          headers: { 'User-Agent': 'AbakanMebel-Proxy/1.0' },
          cf: { cacheTtl: 3600, cacheEverything: true }
        });
        if (directResponse.ok) {
          return buildProxyResponse(directResponse, path);
        }
      }
      // Return 404
      return generate404Response();
    }

    return buildProxyResponse(response, path);
  } catch (error) {
    console.error('[Proxy Error]', error.message);
    return generate502Response();
  }
}

function buildProxyResponse(upstreamResponse, path) {
  const contentType = upstreamResponse.headers.get('Content-Type') || 'text/html';
  const isHTML = contentType.includes('text/html');
  const isCSS = contentType.includes('text/css');
  const isJS = contentType.includes('javascript');
  const isJSON = contentType.includes('application/json');

  let cacheTTL = CONFIG.HTML_CACHE_TTL;
  if (isCSS || isJS) cacheTTL = 86400; // 1 day
  if (isJSON) cacheTTL = 3600; // 1 hour
  if (path.includes('/data/')) cacheTTL = 1800; // 30 min for data files

  const headers = {
    'Content-Type': contentType,
    'Cache-Control': `public, max-age=${cacheTTL}, s-maxage=${Math.floor(cacheTTL / 2)}, stale-while-revalidate=900`,
    'CDN-Cache-Control': `public, max-age=${cacheTTL}, stale-while-revalidate=900`,
    'Vary': 'Accept-Encoding, Accept-Language',
    'X-Cache-Status': 'PROXY-GH-PAGES',
    ...SECURITY_HEADERS
  };

  // For HTML, rewrite absolute URLs from GitHub Pages to our domain
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers
  });
}

// ============================================================
// MEDIA PROXY
// ============================================================
async function loadMediaMap() {
  try {
    const response = await fetchWithTimeout(CONFIG.GITHUB_MEDIA_MAP_URL, {
      headers: { 'User-Agent': 'AbakanMebel-Proxy/1.0' },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    if (!response.ok) return;
    const mapData = await response.json();
    if (mapData && typeof mapData === 'object') {
      mediaHashMap.clear();
      for (const [hash, url] of Object.entries(mapData)) {
        mediaHashMap.set(hash, url);
      }
      console.log('[Media Map] Loaded', Object.keys(mapData).length, 'entries');
    }
  } catch (error) {
    console.error('[Media Map] Error:', error.message);
  }
}

async function handleMediaProxy(request, mediaHash) {
  try {
    // Check cache first
    const cache = caches.default;
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;

    // Special handling for logo hash
    const logoHash = generateMediaHash(CONFIG.SITE_URL + '/logo.png');
    const logoUrlHash = generateMediaHash(CONFIG.LOGO_URL);
    if (mediaHash === logoHash || mediaHash === logoUrlHash) {
      return await handleLogoRequest();
    }

    // Look up in media map
    let originalUrl = mediaHashMap.get(mediaHash);

    // If not found, try loading media map
    if (!originalUrl && mediaHashMap.size === 0) {
      await loadMediaMap();
      originalUrl = mediaHashMap.get(mediaHash);
    }

    // If still not found, try scanning posts data
    if (!originalUrl) {
      try {
        const postsResponse = await fetchWithTimeout(CONFIG.GITHUB_JSON_URL, {
          headers: { 'User-Agent': 'AbakanMebel-Proxy/1.0' },
          cf: { cacheTtl: 3600, cacheEverything: true }
        });
        if (postsResponse.ok) {
          const posts = await postsResponse.json();
          if (Array.isArray(posts)) {
            for (const post of posts) {
              // Check photo_urls
              if (post.photo_urls && Array.isArray(post.photo_urls)) {
                for (const url of post.photo_urls) {
                  if (generateMediaHash(url) === mediaHash) {
                    originalUrl = url;
                    mediaHashMap.set(mediaHash, url);
                    break;
                  }
                }
              }
              if (originalUrl) break;
              // Check video_urls
              if (post.video_urls && Array.isArray(post.video_urls)) {
                for (const url of post.video_urls) {
                  if (generateMediaHash(url) === mediaHash) {
                    originalUrl = url;
                    mediaHashMap.set(mediaHash, url);
                    break;
                  }
                }
              }
              if (originalUrl) break;
            }
          }
        }
      } catch (e) {
        console.error('[Media Proxy] Posts scan error:', e.message);
      }
    }

    if (!originalUrl) {
      return Response.redirect(CONFIG.SITE_URL + '/logo.png', 302);
    }

    // Fetch the original media
    const response = await fetchWithTimeout(originalUrl, {
      headers: { 'User-Agent': 'AbakanMebel-MediaProxy/1.0', 'Accept': 'image/*,video/*' }
    });

    if (!response.ok) {
      return Response.redirect(CONFIG.SITE_URL + '/logo.png', 302);
    }

    const responseHeaders = {
      'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      'Cache-Control': `public, max-age=${CONFIG.MEDIA_CACHE_TTL}, immutable`,
      'CDN-Cache-Control': `public, max-age=${CONFIG.MEDIA_CACHE_TTL}, immutable`,
      'Vary': 'Accept-Encoding',
      'Access-Control-Allow-Origin': '*',
      ...SECURITY_HEADERS
    };

    const bodyBuffer = await response.arrayBuffer();
    const proxyResponse = new Response(bodyBuffer, { status: response.status, headers: responseHeaders });

    // Cache in Cloudflare Cache API
    try {
      const cacheRequest = new Request(request.url);
      const cacheResponse = new Response(bodyBuffer, { status: response.status, headers: responseHeaders });
      await cache.put(cacheRequest, cacheResponse);
    } catch (e) { /* ignore cache errors */ }

    return proxyResponse;
  } catch (error) {
    console.error('[Media Proxy] Error:', error.message);
    return Response.redirect(CONFIG.SITE_URL + '/logo.png', 302);
  }
}

// ============================================================
// LOGO HANDLER
// ============================================================
async function handleLogoRequest() {
  const now = Date.now();
  if (logoCache.data && (now - logoCache.timestamp) < logoCache.ttl) {
    return new Response(logoCache.data, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': `public, max-age=${CONFIG.LOGO_CACHE_TTL}, immutable`,
        'Access-Control-Allow-Origin': '*',
        'X-Cache-Status': 'WORKER-CACHED',
        ...SECURITY_HEADERS
      }
    });
  }
  try {
    const response = await fetchWithTimeout(CONFIG.LOGO_URL, {
      headers: { 'User-Agent': 'AbakanMebel-Proxy/1.0', 'Accept': 'image/*' }
    });
    if (!response.ok) throw new Error('Logo fetch failed');
    const imageBuffer = await response.arrayBuffer();
    logoCache = { data: imageBuffer, timestamp: now, ttl: CONFIG.LOGO_CACHE_TTL };
    return new Response(imageBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': `public, max-age=${CONFIG.LOGO_CACHE_TTL}, immutable`,
        'Access-Control-Allow-Origin': '*',
        'X-Cache-Status': 'WORKER-GENERATED',
        ...SECURITY_HEADERS
      }
    });
  } catch (error) {
    const svgPlaceholder = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect fill="#6366f1" width="640" height="640"/><text x="320" y="340" font-family="Arial,sans-serif" font-size="120" font-weight="bold" fill="white" text-anchor="middle">AM</text></svg>`;
    return new Response(svgPlaceholder, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
        ...SECURITY_HEADERS
      }
    });
  }
}

// ============================================================
// ERROR RESPONSES
// ============================================================
function generate404Response() {
  const html = `<!DOCTYPE html><html lang="ru" data-theme="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 — АбаканМебель</title><link rel="stylesheet" href="https://abakanmebel9-jpg.github.io/a-m/css/style.css"></head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center"><div><h1 style="font-size:4rem;font-weight:900;background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">404</h1><p style="font-size:1.2rem;color:var(--text-secondary);margin:16px 0">Страница не найдена</p><a href="/" class="btn btn--primary">На главную</a></div></body></html>`;
  return new Response(html, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      ...SECURITY_HEADERS
    }
  });
}

function generate502Response() {
  const html = `<!DOCTYPE html><html lang="ru" data-theme="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>502 — АбаканМебель</title></head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;background:#0f172a;color:#f8fafc;font-family:Inter,sans-serif"><div><h1 style="font-size:4rem;font-weight:900;color:#6366f1">502</h1><p style="font-size:1.2rem;color:#cbd5e1;margin:16px 0">Сервер временно недоступен</p><a href="/" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border-radius:9999px;text-decoration:none;font-weight:700">На главную</a></div></body></html>`;
  return new Response(html, {
    status: 502,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS
    }
  });
}

// ============================================================
// MAIN REQUEST HANDLER
// ============================================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Only handle GET and HEAD requests
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // ============================================================
    // ROUTE: Media proxy /m/{hash}
    // ============================================================
    if (path.startsWith('/m/')) {
      const mediaHash = path.replace('/m/', '');
      if (mediaHash && mediaHash.length > 1) {
        return handleMediaProxy(request, mediaHash);
      }
      return Response.redirect(CONFIG.SITE_URL + '/logo.png', 302);
    }

    // ============================================================
    // ROUTE: Logo and favicon
    // ============================================================
    if (path === '/logo.png' || path === '/logo.jpg' || path === '/favicon.ico' || path === '/favicon.png') {
      return handleLogoRequest();
    }

    // ============================================================
    // ROUTE: API compatibility (redirect or simple response)
    // ============================================================
    if (path.startsWith('/api/')) {
      // /api/posts — redirect to static JSON
      if (path === '/api/posts') {
        return Response.redirect(CONFIG.SITE_URL + '/data/posts.json', 301);
      }
      // /api/posts/page — not needed for static, return empty
      if (path === '/api/posts/page') {
        return new Response(JSON.stringify({ success: false, posts: [], message: 'Use /data/posts.json for static data' }), {
          headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS }
        });
      }
      // /api/health
      if (path === '/api/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          version: '1.0-proxy',
          architecture: 'github-pages-proxy',
          mediaMapSize: mediaHashMap.size,
          timestamp: new Date().toISOString()
        }), {
          headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS }
        });
      }
      return new Response('Not Found', { status: 404 });
    }

    // ============================================================
    // ROUTE: BingSiteAuth.xml
    // ============================================================
    if (path === '/BingSiteAuth.xml') {
      return new Response('<?xml version="1.0"?><users><user>PLACEHOLDER_BING</user></users>', {
        headers: { 'Content-Type': 'application/xml', ...SECURITY_HEADERS }
      });
    }

    // ============================================================
    // ROUTE: ads.txt
    // ============================================================
    if (path === '/ads.txt') {
      return new Response('# AbakanMebel ads.txt placeholder\ngoogle.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0', {
        headers: { 'Content-Type': 'text/plain', ...SECURITY_HEADERS }
      });
    }

    // ============================================================
    // ROUTE: security.txt
    // ============================================================
    if (path === '/.well-known/security.txt') {
      return new Response('Contact: ' + CONFIG.SITE_URL + '\nContact: tel:+79134483717', {
        headers: { 'Content-Type': 'text/plain', ...SECURITY_HEADERS }
      });
    }

    // ============================================================
    // ROUTE: All other requests — proxy to GitHub Pages
    // ============================================================
    return proxyToGitHubPages(request, path);
  }
};
