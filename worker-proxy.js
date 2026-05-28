// ============================================================
// ABAKANMEBEL Cloudflare Worker — Reverse Proxy to GitHub Pages
// ============================================================
// VERSION: 3.0 — CACHING EDITION
// ARCHITECTURE: Client → Worker (Memory Cache → Cache API → GitHub Pages)
//
// CACHING LAYERS:
//   1. Memory Cache  — in-process LRU Map (fastest, per-isolate)
//   2. Cache API     — Cloudflare edge cache (shared across requests)
//   3. Origin Fetch  — GitHub Pages (slowest, fallback)
//
// CACHE STRATEGY:
//   - Static assets (CSS/JS/fonts): Memory + Cache API, TTL 7d
//   - HTML pages: Memory + Cache API, TTL 2h, SWR 10min
//   - JSON data: Memory + Cache API, TTL 30min, SWR 5min
//   - Media (/m/*): Cache API only (large blobs), TTL 30d
//   - Logo/favicon: Memory + Cache API, TTL 7d
//   - 404 pages: Memory, TTL 5min
// ============================================================

const CONFIG = {
  SITE_URL: 'https://abakanmebel.online',
  LOGO_URL: 'https://i.pinimg.com/736x/99/d6/71/99d67109954a1bc4102f2142a82d2de7.jpg',
  GITHUB_PAGES_URL: 'https://abakanmebel9-jpg.github.io/a-m',
  GITHUB_MEDIA_MAP_URL: 'https://raw.githubusercontent.com/abakanmebel9-jpg/a-m/main/data/media_map.json',
  GITHUB_POSTS_JSON_URL: 'https://abakanmebel9-jpg.github.io/a-m/data/posts.json',
  FETCH_TIMEOUT_MS: 15000,
  MEDIA_MAP_REFRESH_INTERVAL: 3600000, // 1 hour
};

// ============================================================
// CACHE TTL CONFIGURATION
// ============================================================
const CACHE_TTL = {
  MEDIA:     2592000,  // 30 days
  LOGO:      604800,   // 7 days
  CSS_JS:    604800,   // 7 days
  HTML:      7200,     // 2 hours
  JSON:      1800,     // 30 min
  DATA:      900,      // 15 min
  FONTS:     2592000,  // 30 days
  OTHER:     3600,     // 1 hour
  NOT_FOUND: 300,      // 5 min
  ERROR:     0,        // no cache
};

// Stale-while-revalidate windows (seconds)
const SWR = {
  MEDIA: 86400,    // 1 day
  HTML: 600,       // 10 min
  JSON: 300,       // 5 min
  CSS_JS: 3600,    // 1 hour
  OTHER: 300,      // 5 min
};

// ============================================================
// MEMORY CACHE — LRU with TTL
// ============================================================
class MemoryCache {
  constructor(maxEntries = 600, maxEntrySize = 512 * 1024) {
    this.cache = new Map();
    this.maxEntries = maxEntries;
    this.maxEntrySize = maxEntrySize; // Skip storing blobs > 512KB in memory
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    // Check TTL
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    // Move to end (LRU refresh)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry;
  }

  set(key, value, ttlSeconds, size = 0) {
    // Don't store entries that are too large
    if (size > this.maxEntrySize) return;

    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      body: value,
      headers: null, // Will be set separately
      status: 200,
      expiresAt: Date.now() + (ttlSeconds * 1000),
      createdAt: Date.now(),
      size: size,
    });
  }

  setFull(key, body, headers, status, ttlSeconds, size = 0) {
    if (size > this.maxEntrySize) return;

    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      body: body,
      headers: headers,
      status: status,
      expiresAt: Date.now() + (ttlSeconds * 1000),
      createdAt: Date.now(),
      size: size,
    });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  get stats() {
    return {
      entries: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0
        ? ((this.hits / (this.hits + this.misses)) * 100).toFixed(1) + '%'
        : 'N/A',
      estimatedSizeKB: Math.round(
        [...this.cache.values()].reduce((sum, e) => sum + (e.size || 0), 0) / 1024
      ),
    };
  }
}

const memCache = new MemoryCache(600, 512 * 1024);

// ============================================================
// GLOBAL STATE
// ============================================================
let mediaHashMap = new Map();
let mediaMapLastLoaded = 0;

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

// Determine cache TTL and SWR for a given path and content type
function getCachePolicy(path, contentType) {
  const ct = (contentType || '').toLowerCase();
  const p = path.toLowerCase();

  // Media
  if (p.startsWith('/m/')) return { ttl: CACHE_TTL.MEDIA, swr: SWR.MEDIA, layer: 'media' };

  // CSS / JS
  if (ct.includes('text/css') || ct.includes('javascript')) return { ttl: CACHE_TTL.CSS_JS, swr: SWR.CSS_JS, layer: 'static' };
  if (p.match(/\.(css|js)(\?|$)/)) return { ttl: CACHE_TTL.CSS_JS, swr: SWR.CSS_JS, layer: 'static' };

  // Fonts
  if (ct.includes('font') || p.match(/\.(woff2?|ttf|otf|eot)(\?|$)/)) return { ttl: CACHE_TTL.FONTS, swr: SWR.MEDIA, layer: 'static' };

  // Images (non-media-proxy)
  if (ct.includes('image/') || p.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)(\?|$)/)) return { ttl: CACHE_TTL.MEDIA, swr: SWR.MEDIA, layer: 'image' };

  // JSON data
  if (ct.includes('application/json') || p.match(/\.json(\?|$)/)) {
    if (p.includes('/data/')) return { ttl: CACHE_TTL.DATA, swr: SWR.JSON, layer: 'data' };
    return { ttl: CACHE_TTL.JSON, swr: SWR.JSON, layer: 'json' };
  }

  // XML (sitemap, RSS, etc.)
  if (ct.includes('xml') || p.match(/\.(xml|rss|atom)(\?|$)/)) return { ttl: CACHE_TTL.HTML, swr: SWR.HTML, layer: 'xml' };

  // HTML pages (default)
  if (ct.includes('text/html') || p.endsWith('/') || p === '/' || p.match(/\.(html?)(\?|$)/)) {
    return { ttl: CACHE_TTL.HTML, swr: SWR.HTML, layer: 'html' };
  }

  // Fallback
  return { ttl: CACHE_TTL.OTHER, swr: SWR.OTHER, layer: 'other' };
}

// Build response headers with proper cache-control
function buildCacheHeaders(policy, source) {
  return {
    'Cache-Control': `public, max-age=${policy.ttl}, s-maxage=${policy.ttl}, stale-while-revalidate=${policy.swr}`,
    'CDN-Cache-Control': `public, max-age=${policy.ttl}, stale-while-revalidate=${policy.swr}`,
    'X-Cache-Source': source,
  };
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
// CACHE API HELPERS
// ============================================================
async function cacheApiGet(request) {
  try {
    const cache = caches.default;
    return await cache.match(request);
  } catch (e) {
    return null;
  }
}

async function cacheApiPut(request, response) {
  try {
    const cache = caches.default;
    // Clone response before putting (consumes body)
    await cache.put(request, response.clone());
  } catch (e) {
    // Silently ignore cache API errors
  }
}

// ============================================================
// GITHUB PAGES PROXY WITH MULTI-LAYER CACHE
// ============================================================
async function proxyToGitHubPages(request, path, ctx) {
  const cacheKey = new Request(request.url, { method: 'GET' });

  // ---- LAYER 1: Memory Cache ----
  const memEntry = memCache.get(path);
  if (memEntry && memEntry.headers) {
    // Check if stale (expired but within SWR window)
    const now = Date.now();
    const isStale = now > memEntry.expiresAt;
    const policy = getCachePolicy(path, memEntry.headers['content-type'] || memEntry.headers['Content-Type'] || '');

    if (!isStale) {
      // Fresh hit — return immediately
      return new Response(memEntry.body, {
        status: memEntry.status,
        headers: {
          ...memEntry.headers,
          ...buildCacheHeaders(policy, 'MEMORY-CACHE'),
          'Age': Math.round((now - memEntry.createdAt) / 1000),
        }
      });
    }

    // Stale but within SWR — return stale, revalidate in background
    const staleMaxAge = (now - memEntry.expiresAt) / 1000;
    if (staleMaxAge < policy.swr) {
      ctx.waitUntil(revalidateGitHubPage(request, path, cacheKey, ctx));
      return new Response(memEntry.body, {
        status: memEntry.status,
        headers: {
          ...memEntry.headers,
          'Cache-Control': `public, max-age=0, stale-while-revalidate=${policy.swr}`,
          'X-Cache-Source': 'MEMORY-CACHE-STALE',
          'Age': Math.round((now - memEntry.createdAt) / 1000),
        }
      });
    }
    // Fully expired beyond SWR — fall through to fetch fresh
    memCache.delete(path);
  }

  // ---- LAYER 2: Cache API ----
  const apiCached = await cacheApiGet(cacheKey);
  if (apiCached) {
    const contentType = apiCached.headers.get('Content-Type') || '';
    const policy = getCachePolicy(path, contentType);
    const age = apiCached.headers.get('Age');
    const dateHeader = apiCached.headers.get('Date');
    let isApiStale = false;

    if (dateHeader) {
      const ageSeconds = (Date.now() - new Date(dateHeader).getTime()) / 1000;
      if (ageSeconds > policy.ttl) isApiStale = true;
    }

    // Also store in memory cache for faster subsequent hits
    try {
      const bodyText = await apiCached.clone().text();
      const respHeaders = {};
      apiCached.headers.forEach((v, k) => { respHeaders[k] = v; });
      memCache.setFull(path, bodyText, respHeaders, apiCached.status, policy.ttl, bodyText.length);
    } catch (e) { /* ignore */ }

    if (!isApiStale) {
      // Fresh Cache API hit
      return new Response(apiCached.body, {
        status: apiCached.status,
        headers: {
          ...Object.fromEntries(apiCached.headers.entries()),
          ...buildCacheHeaders(policy, 'CACHE-API'),
        }
      });
    }

    // Stale Cache API — serve stale, revalidate in background
    ctx.waitUntil(revalidateGitHubPage(request, path, cacheKey, ctx));
    return new Response(apiCached.body, {
      status: apiCached.status,
      headers: {
        ...Object.fromEntries(apiCached.headers.entries()),
        'Cache-Control': `public, max-age=0, stale-while-revalidate=${policy.swr}`,
        'X-Cache-Source': 'CACHE-API-STALE',
      }
    });
  }

  // ---- LAYER 3: Origin Fetch ----
  return await fetchAndCacheGitHubPage(request, path, cacheKey, ctx);
}

// Revalidate in background (no client waits)
async function revalidateGitHubPage(request, path, cacheKey, ctx) {
  try {
    const freshResponse = await fetchGitHubPageOrigin(path);
    if (freshResponse.ok) {
      const contentType = freshResponse.headers.get('Content-Type') || '';
      const policy = getCachePolicy(path, contentType);

      // Store in memory cache
      try {
        const bodyText = await freshResponse.clone().text();
        const respHeaders = buildProxyResponseHeaders(contentType, path, policy, 'ORIGIN-REFRESHED');
        memCache.setFull(path, bodyText, respHeaders, freshResponse.status, policy.ttl, bodyText.length);
      } catch (e) { /* ignore */ }

      // Store in Cache API
      try {
        const cacheApiResponse = freshResponse.clone();
        const headers = new Headers(cacheApiResponse.headers);
        headers.set('Date', new Date().toUTCString());
        headers.set('Cache-Control', `public, max-age=${policy.ttl}, stale-while-revalidate=${policy.swr}`);
        const cachedResp = new Response(cacheApiResponse.body, {
          status: cacheApiResponse.status,
          headers
        });
        await cacheApiPut(cacheKey, cachedResp);
      } catch (e) { /* ignore */ }
    }
  } catch (e) {
    console.error('[Revalidate Error]', e.message);
  }
}

// Fetch from GitHub Pages origin
async function fetchGitHubPageOrigin(path) {
  let ghUrl;
  if (path === '/' || path === '/index.html') {
    ghUrl = CONFIG.GITHUB_PAGES_URL + '/index.html';
  } else if (path.endsWith('/')) {
    ghUrl = CONFIG.GITHUB_PAGES_URL + path + 'index.html';
  } else if (path.match(/\.(html|css|js|json|xml|txt|ico|png|jpg|svg|webmanifest)$/)) {
    ghUrl = CONFIG.GITHUB_PAGES_URL + path;
  } else {
    ghUrl = CONFIG.GITHUB_PAGES_URL + path + '/index.html';
  }

  return await fetchWithTimeout(ghUrl, {
    headers: {
      'User-Agent': 'AbakanMebel-Proxy/3.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    cf: { cacheTtl: 3600, cacheEverything: true }
  });
}

// Build headers for proxy response
function buildProxyResponseHeaders(contentType, path, policy, source) {
  return {
    'Content-Type': contentType,
    'Cache-Control': `public, max-age=${policy.ttl}, s-maxage=${policy.ttl}, stale-while-revalidate=${policy.swr}`,
    'CDN-Cache-Control': `public, max-age=${policy.ttl}, stale-while-revalidate=${policy.swr}`,
    'Vary': 'Accept-Encoding, Accept-Language',
    'Date': new Date().toUTCString(),
    'X-Cache-Source': source,
    ...SECURITY_HEADERS
  };
}

// Fetch from origin and cache result
async function fetchAndCacheGitHubPage(request, path, cacheKey, ctx) {
  try {
    let response = await fetchGitHubPageOrigin(path);

    if (!response.ok) {
      // Try direct path fallback for directory-style URLs
      if (!path.match(/\.\w+$/)) {
        const directUrl = CONFIG.GITHUB_PAGES_URL + path;
        const directResponse = await fetchWithTimeout(directUrl, {
          headers: { 'User-Agent': 'AbakanMebel-Proxy/3.0' },
          cf: { cacheTtl: 3600, cacheEverything: true }
        });
        if (directResponse.ok) {
          response = directResponse;
        }
      }
    }

    if (!response.ok) {
      const notFoundResponse = generate404Response();
      // Cache 404s briefly in memory only
      memCache.setFull(path, '', { 'Content-Type': 'text/html' }, 404, CACHE_TTL.NOT_FOUND, 0);
      return notFoundResponse;
    }

    const contentType = response.headers.get('Content-Type') || 'text/html';
    const policy = getCachePolicy(path, contentType);
    const headers = buildProxyResponseHeaders(contentType, path, policy, 'ORIGIN-FETCH');

    // Read body for memory caching
    const bodyBuffer = await response.arrayBuffer();
    const bodyText = new TextDecoder().decode(bodyBuffer);

    // Store in Memory Cache
    memCache.setFull(path, bodyText, headers, response.status, policy.ttl, bodyBuffer.byteLength);

    // Store in Cache API
    const cacheApiResponse = new Response(bodyBuffer, {
      status: response.status,
      headers: new Headers(headers)
    });
    ctx.waitUntil(cacheApiPut(cacheKey, cacheApiResponse));

    return new Response(bodyBuffer, {
      status: response.status,
      headers
    });
  } catch (error) {
    console.error('[Proxy Error]', error.message);
    return generate502Response();
  }
}

// ============================================================
// MEDIA PROXY WITH CACHING
// ============================================================
async function loadMediaMap() {
  const now = Date.now();
  if (mediaHashMap.size > 0 && (now - mediaMapLastLoaded) < CONFIG.MEDIA_MAP_REFRESH_INTERVAL) {
    return;
  }
  try {
    const response = await fetchWithTimeout(CONFIG.GITHUB_MEDIA_MAP_URL, {
      headers: { 'User-Agent': 'AbakanMebel-Proxy/3.0' },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    if (!response.ok) return;
    const mapData = await response.json();
    if (mapData && typeof mapData === 'object') {
      mediaHashMap.clear();
      for (const [hash, url] of Object.entries(mapData)) {
        mediaHashMap.set(hash, url);
      }
      mediaMapLastLoaded = now;
      console.log('[Media Map] Loaded', Object.keys(mapData).length, 'entries');
    }
  } catch (error) {
    console.error('[Media Map] Error:', error.message);
  }
}

async function handleMediaProxy(request, mediaHash, ctx) {
  try {
    // ---- LAYER 1: Memory Cache (small media only, < 200KB) ----
    const memKey = '/m/' + mediaHash;
    const memEntry = memCache.get(memKey);
    if (memEntry && memEntry.headers) {
      const now = Date.now();
      if (now <= memEntry.expiresAt) {
        return new Response(memEntry.body, {
          status: memEntry.status,
          headers: {
            ...memEntry.headers,
            'X-Cache-Source': 'MEMORY-CACHE',
            'Age': Math.round((now - memEntry.createdAt) / 1000),
          }
        });
      }
      // Stale — serve stale, revalidate in background
      const policy = getCachePolicy(memKey, memEntry.headers['Content-Type'] || '');
      ctx.waitUntil(revalidateMedia(request, mediaHash, memKey, ctx));
      return new Response(memEntry.body, {
        status: memEntry.status,
        headers: {
          ...memEntry.headers,
          'Cache-Control': `public, max-age=0, stale-while-revalidate=${policy.swr}`,
          'X-Cache-Source': 'MEMORY-CACHE-STALE',
        }
      });
    }

    // ---- LAYER 2: Cache API ----
    const cacheKey = new Request(request.url, { method: 'GET' });
    const apiCached = await cacheApiGet(cacheKey);
    if (apiCached) {
      const contentType = apiCached.headers.get('Content-Type') || '';
      const dateHeader = apiCached.headers.get('Date');
      const policy = getCachePolicy(memKey, contentType);
      let isApiStale = false;

      if (dateHeader) {
        const ageSeconds = (Date.now() - new Date(dateHeader).getTime()) / 1000;
        if (ageSeconds > policy.ttl) isApiStale = true;
      }

      // Store small media in memory cache
      const contentLength = parseInt(apiCached.headers.get('Content-Length') || '0', 10);
      if (contentLength < 200 * 1024) {
        try {
          const bodyBuf = await apiCached.clone().arrayBuffer();
          const bodyText = String.fromCharCode.apply(null, new Uint8Array(bodyBuf)); // binary, but for small images it's ok for mem cache
          const respHeaders = {};
          apiCached.headers.forEach((v, k) => { respHeaders[k] = v; });
          memCache.setFull(memKey, bodyBuf, respHeaders, apiCached.status, policy.ttl, contentLength);
        } catch (e) { /* ignore */ }
      }

      if (!isApiStale) {
        return new Response(apiCached.body, {
          status: apiCached.status,
          headers: {
            ...Object.fromEntries(apiCached.headers.entries()),
            ...buildCacheHeaders(policy, 'CACHE-API'),
          }
        });
      }

      // Stale — serve, revalidate in background
      ctx.waitUntil(revalidateMedia(request, mediaHash, memKey, ctx));
      return new Response(apiCached.body, {
        status: apiCached.status,
        headers: {
          ...Object.fromEntries(apiCached.headers.entries()),
          'Cache-Control': `public, max-age=0, stale-while-revalidate=${policy.swr}`,
          'X-Cache-Source': 'CACHE-API-STALE',
        }
      });
    }

    // ---- LAYER 3: Origin Fetch ----
    return await fetchAndCacheMedia(request, mediaHash, memKey, cacheKey, ctx);
  } catch (error) {
    console.error('[Media Proxy] Error:', error.message);
    return Response.redirect(CONFIG.SITE_URL + '/logo.png', 302);
  }
}

// Revalidate media in background
async function revalidateMedia(request, mediaHash, memKey, ctx) {
  try {
    const result = await fetchMediaOrigin(mediaHash);
    if (result) {
      const policy = getCachePolicy(memKey, result.contentType);

      // Store small media in memory
      if (result.bodyBuffer.byteLength < 200 * 1024) {
        const respHeaders = {
          'Content-Type': result.contentType,
          ...buildCacheHeaders(policy, 'ORIGIN-REFRESHED'),
          'Access-Control-Allow-Origin': '*',
          ...SECURITY_HEADERS
        };
        memCache.setFull(memKey, result.bodyBuffer, respHeaders, 200, policy.ttl, result.bodyBuffer.byteLength);
      }

      // Store in Cache API
      const cacheKey = new Request(request.url, { method: 'GET' });
      const cacheApiResponse = new Response(result.bodyBuffer, {
        status: 200,
        headers: new Headers({
          'Content-Type': result.contentType,
          'Content-Length': String(result.bodyBuffer.byteLength),
          'Cache-Control': `public, max-age=${policy.ttl}, stale-while-revalidate=${policy.swr}`,
          'Date': new Date().toUTCString(),
          'Access-Control-Allow-Origin': '*',
          ...SECURITY_HEADERS
        })
      });
      await cacheApiPut(cacheKey, cacheApiResponse);
    }
  } catch (e) {
    console.error('[Media Revalidate Error]', e.message);
  }
}

// Fetch media from origin (Telegram, etc.)
async function fetchMediaOrigin(mediaHash) {
  // Check logo
  const logoHash = generateMediaHash(CONFIG.SITE_URL + '/logo.png');
  const logoUrlHash = generateMediaHash(CONFIG.LOGO_URL);
  if (mediaHash === logoHash || mediaHash === logoUrlHash) {
    const logoResponse = await fetchLogoOrigin();
    if (logoResponse) return logoResponse;
  }

  // Look up in media map
  let originalUrl = mediaHashMap.get(mediaHash);
  if (!originalUrl) {
    await loadMediaMap();
    originalUrl = mediaHashMap.get(mediaHash);
  }

  // Fallback: scan posts JSON
  if (!originalUrl) {
    try {
      const postsResponse = await fetchWithTimeout(CONFIG.GITHUB_POSTS_JSON_URL, {
        headers: { 'User-Agent': 'AbakanMebel-Proxy/3.0' },
        cf: { cacheTtl: 3600, cacheEverything: true }
      });
      if (postsResponse.ok) {
        const posts = await postsResponse.json();
        if (Array.isArray(posts)) {
          for (const post of posts) {
            if (post.media && Array.isArray(post.media)) {
              for (const m of post.media) {
                if (m.directUrl && generateMediaHash(m.directUrl) === mediaHash) {
                  originalUrl = m.directUrl;
                  mediaHashMap.set(mediaHash, m.directUrl);
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

  if (!originalUrl) return null;

  const response = await fetchWithTimeout(originalUrl, {
    headers: { 'User-Agent': 'AbakanMebel-MediaProxy/3.0', 'Accept': 'image/*,video/*' }
  });

  if (!response.ok) return null;

  const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
  const bodyBuffer = await response.arrayBuffer();
  return { contentType, bodyBuffer };
}

// Fetch logo from origin
async function fetchLogoOrigin() {
  try {
    const response = await fetchWithTimeout(CONFIG.LOGO_URL, {
      headers: { 'User-Agent': 'AbakanMebel-Proxy/3.0', 'Accept': 'image/*' }
    });
    if (!response.ok) return null;
    const bodyBuffer = await response.arrayBuffer();
    return { contentType: 'image/jpeg', bodyBuffer };
  } catch (e) {
    return null;
  }
}

// Fetch media and cache the result
async function fetchAndCacheMedia(request, mediaHash, memKey, cacheKey, ctx) {
  // Special handling for logo
  const logoHash = generateMediaHash(CONFIG.SITE_URL + '/logo.png');
  const logoUrlHash = generateMediaHash(CONFIG.LOGO_URL);
  if (mediaHash === logoHash || mediaHash === logoUrlHash) {
    return await handleLogoRequest(ctx);
  }

  const result = await fetchMediaOrigin(mediaHash);

  if (!result) {
    return Response.redirect(CONFIG.SITE_URL + '/logo.png', 302);
  }

  const policy = getCachePolicy(memKey, result.contentType);
  const headers = {
    'Content-Type': result.contentType,
    'Content-Length': String(result.bodyBuffer.byteLength),
    ...buildCacheHeaders(policy, 'ORIGIN-FETCH'),
    'Vary': 'Accept-Encoding',
    'Access-Control-Allow-Origin': '*',
    'Date': new Date().toUTCString(),
    ...SECURITY_HEADERS
  };

  // Store in Memory Cache (small media only)
  if (result.bodyBuffer.byteLength < 200 * 1024) {
    memCache.setFull(memKey, result.bodyBuffer, headers, 200, policy.ttl, result.bodyBuffer.byteLength);
  }

  // Store in Cache API
  const cacheApiResponse = new Response(result.bodyBuffer, {
    status: 200,
    headers: new Headers(headers)
  });
  ctx.waitUntil(cacheApiPut(cacheKey, cacheApiResponse));

  return new Response(result.bodyBuffer, { status: 200, headers });
}

// ============================================================
// LOGO HANDLER WITH CACHING
// ============================================================
async function handleLogoRequest(ctx) {
  const memKey = '/logo';
  const policy = getCachePolicy('/logo.png', 'image/jpeg');

  // Memory Cache
  const memEntry = memCache.get(memKey);
  if (memEntry && memEntry.headers && Date.now() <= memEntry.expiresAt) {
    return new Response(memEntry.body, {
      status: 200,
      headers: {
        ...memEntry.headers,
        'X-Cache-Source': 'MEMORY-CACHE',
        'Age': Math.round((Date.now() - memEntry.createdAt) / 1000),
      }
    });
  }

  // Cache API
  const cacheKey = new Request(CONFIG.SITE_URL + '/logo.png', { method: 'GET' });
  const apiCached = await cacheApiGet(cacheKey);
  if (apiCached) {
    // Store in memory
    try {
      const buf = await apiCached.clone().arrayBuffer();
      const respHeaders = {};
      apiCached.headers.forEach((v, k) => { respHeaders[k] = v; });
      memCache.setFull(memKey, buf, respHeaders, 200, CACHE_TTL.LOGO, buf.byteLength);
    } catch (e) { /* ignore */ }

    return new Response(apiCached.body, {
      status: 200,
      headers: {
        ...Object.fromEntries(apiCached.headers.entries()),
        ...buildCacheHeaders(policy, 'CACHE-API'),
      }
    });
  }

  // Origin Fetch
  try {
    const result = await fetchLogoOrigin();
    if (!result) throw new Error('Logo fetch failed');

    const headers = {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(result.bodyBuffer.byteLength),
      ...buildCacheHeaders(policy, 'ORIGIN-FETCH'),
      'Access-Control-Allow-Origin': '*',
      'Date': new Date().toUTCString(),
      ...SECURITY_HEADERS
    };

    // Store in Memory Cache
    memCache.setFull(memKey, result.bodyBuffer, headers, 200, CACHE_TTL.LOGO, result.bodyBuffer.byteLength);

    // Store in Cache API
    const cacheApiResponse = new Response(result.bodyBuffer, {
      status: 200,
      headers: new Headers(headers)
    });
    if (ctx) ctx.waitUntil(cacheApiPut(cacheKey, cacheApiResponse));

    return new Response(result.bodyBuffer, { status: 200, headers });
  } catch (error) {
    // SVG fallback
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
  const html = `<!DOCTYPE html><html lang="ru" data-theme="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 — АбаканМебель</title><link rel="stylesheet" href="/css/style.css"></head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center"><div><h1 style="font-size:4rem;font-weight:900;background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">404</h1><p style="font-size:1.2rem;color:var(--text-secondary);margin:16px 0">Страница не найдена</p><a href="/" class="btn btn--primary">На главную</a></div></body></html>`;
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
// CACHE ADMIN ENDPOINTS
// ============================================================
async function handleCacheAdmin(path, request) {
  // /api/cache/stats — cache statistics
  if (path === '/api/cache/stats') {
    return new Response(JSON.stringify({
      memoryCache: memCache.stats,
      mediaMapSize: mediaHashMap.size,
      mediaMapAge: mediaMapLastLoaded ? Math.round((Date.now() - mediaMapLastLoaded) / 60000) + 'min' : 'not-loaded',
      timestamp: new Date().toISOString(),
    }, null, 2), {
      headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS }
    });
  }

  // /api/cache/purge — purge all caches
  if (path === '/api/cache/purge') {
    memCache.clear();
    try {
      const cache = caches.default;
      // Note: Cache API doesn't have a .deleteAll() method, we delete by known patterns
      // This is a best-effort purge
    } catch (e) { /* ignore */ }
    mediaHashMap.clear();
    mediaMapLastLoaded = 0;

    return new Response(JSON.stringify({
      success: true,
      message: 'All caches purged',
      timestamp: new Date().toISOString(),
    }, null, 2), {
      headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS }
    });
  }

  // /api/cache/purge/{path} — purge specific path
  const purgeMatch = path.match(/^\/api\/cache\/purge\/(.+)$/);
  if (purgeMatch) {
    const purgePath = '/' + purgeMatch[1];
    memCache.delete(purgePath);

    try {
      const cache = caches.default;
      const purgeUrl = CONFIG.SITE_URL + purgePath;
      await cache.delete(new Request(purgeUrl, { method: 'GET' }));
    } catch (e) { /* ignore */ }

    return new Response(JSON.stringify({
      success: true,
      purged: purgePath,
      timestamp: new Date().toISOString(),
    }, null, 2), {
      headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS }
    });
  }

  return new Response('Not Found', { status: 404 });
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

    // Pre-load media map in background on first request
    if (mediaHashMap.size === 0) {
      ctx.waitUntil(loadMediaMap());
    }

    // ============================================================
    // ROUTE: Media proxy /m/{hash}
    // ============================================================
    if (path.startsWith('/m/')) {
      const mediaHash = path.replace('/m/', '');
      if (mediaHash && mediaHash.length > 1) {
        return handleMediaProxy(request, mediaHash, ctx);
      }
      return Response.redirect(CONFIG.SITE_URL + '/logo.png', 302);
    }

    // ============================================================
    // ROUTE: Logo and favicon
    // ============================================================
    if (path === '/logo.png' || path === '/logo.jpg' || path === '/favicon.ico' || path === '/favicon.png') {
      return handleLogoRequest(ctx);
    }

    // ============================================================
    // ROUTE: Cache admin
    // ============================================================
    if (path.startsWith('/api/cache/')) {
      return handleCacheAdmin(path, request);
    }

    // ============================================================
    // ROUTE: API compatibility
    // ============================================================
    if (path.startsWith('/api/')) {
      if (path === '/api/posts') {
        return Response.redirect(CONFIG.SITE_URL + '/data/posts.json', 301);
      }
      if (path === '/api/posts/page') {
        return new Response(JSON.stringify({ success: false, posts: [], message: 'Use /data/posts.json for static data' }), {
          headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS }
        });
      }
      if (path === '/api/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          version: '3.0-caching-proxy',
          architecture: 'github-pages-proxy',
          cache: memCache.stats,
          mediaMapSize: mediaHashMap.size,
          mediaMapAge: mediaMapLastLoaded ? Math.round((Date.now() - mediaMapLastLoaded) / 60000) + 'min' : 'not-loaded',
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
    // ROUTE: All other requests — proxy to GitHub Pages (with cache)
    // ============================================================
    return proxyToGitHubPages(request, path, ctx);
  },

  // ============================================================
  // SCHEDULED HANDLER — refresh media map periodically
  // ============================================================
  async scheduled(event, env, ctx) {
    ctx.waitUntil(loadMediaMap());
  }
};
