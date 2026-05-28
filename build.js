#!/usr/bin/env node
// ============================================================
// ABAKANMEBEL Static Site Generator
// Generates static HTML files for GitHub Pages from posts data
// ============================================================
const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, 'docs');
const DATA_DIR = path.join(__dirname, 'data');

// ============================================================
// CONFIG
// ============================================================
const CONFIG = {
  SITE_URL: 'https://abakanmebel.online',
  SITE_NAME: 'АбаканМебель',
  SITE_AUTHOR: 'АбаканМебель',
  LOGO_URL: 'https://i.pinimg.com/736x/99/d6/71/99d67109954a1bc4102f2142a82d2de7.jpg',
  LOGO_WIDTH: 640,
  LOGO_HEIGHT: 640,
  PHONE: '+7 (913) 448-37-17',
  PHONE_LINK: 'tel:+79134483717',
  ADDRESS: 'г. Абакан, ул. Гончарная, 10',
  ADDRESS_STREET: 'ул. Гончарная, 10',
  ADDRESS_CITY: 'Абакан',
  ADDRESS_REGION: 'Республика Хакасия',
  ADDRESS_POSTAL: '655000',
  LATITUDE: 53.7156,
  LONGITUDE: 91.4289,
  TELEGRAM_CHANNEL: '@abakan_mebel',
  TELEGRAM_WEB: 'https://t.me/s/abakan_mebel',
  TELEGRAM_PHONE: 'https://t.me/+79134483717',
  INSTAGRAM: 'https://www.instagram.com/abakan_mebel/',
  WHATSAPP: 'https://wa.me/79134483717',
  VK: 'https://vk.com/abakan_mebel24',
  POSTS_PER_PAGE: 20,
  MAX_POSTS: 5000,
  MAX_MEDIA_PER_POST: 20,
  MAX_HASHTAGS_PER_POST: 12,
  HASHTAG_MIN_LENGTH: 3,
  POPULAR_TAGS_LIMIT: 12,
  RELATED_POSTS_LIMIT: 30,
  RELATED_POSTS_COUNT: 7,
  DEFAULT_THEME: 'dark',
  MAX_POSTS_RSS: 50,
  MAX_POSTS_SITEMAP: 1000,
  GOOGLE_NEWS_CATEGORY: 'Home & Garden',
  WORKING_HOURS: { days: { ru: 'Пн-Сб', en: 'Mon-Sat' }, time: '9:00-19:00' },
  NEWS_KEYWORDS: [
    'кухни на заказ Абакан', 'шкафы-купе Абакан', 'мебель на заказ Хакасия', 'кухни по размерам',
    'встроенные шкафы Хакасия', 'корпусная мебель Абакан', 'кухни от производителя', 'мебельная фабрика Абакан',
    'заказать кухню Абакан', 'кухни недорого Хакасия', 'мебель Абакан цена', 'шкафы купе на заказ',
    'мебельная компания Абакан', 'изготовление мебели Хакасия', 'кухонный гарнитур', 'шкаф в прихожую',
    'детская мебель', 'гардеробная на заказ', 'мебель для гостиной', 'мебель для спальни',
    'кухни МДФ', 'кухни пластик', 'кухни массив', 'шкафы Aristo', 'шкафы Versailles',
    'фурнитура Blum', 'фурнитура Hettich', '3D дизайн проект', 'бесплатный замер', 'гарантия 3 года',
    'custom kitchens Abakan', 'sliding wardrobes Abakan', 'custom furniture Khakassia',
    'kitchen manufacturer', 'furniture factory Abakan', 'wardrobes custom made'
  ]
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function getCurrentYear() { return new Date().getFullYear(); }

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, m => ESCAPE_MAP[m]);
}

function hashString(str) {
  if (!str || typeof str !== 'string') return '0';
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}

function generateMediaHash(url) { return hashString(url); }

function getProxyMediaUrl(originalUrl) {
  if (!originalUrl) return CONFIG.SITE_URL + '/logo.png';
  const hash = generateMediaHash(originalUrl);
  return CONFIG.SITE_URL + '/m/' + hash;
}

const CYRILLIC_TO_LATIN = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh',
  'з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
  'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts',
  'ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu',
  'я':'ya','А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo',
  'Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N',
  'О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'H',
  'Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sch','Ъ':'','Ы':'Y','Ь':'','Э':'E',
  'Ю':'Yu','Я':'Ya'
};

function transliterateCyrillic(text) {
  if (!text || typeof text !== 'string') return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += CYRILLIC_TO_LATIN[text[i]] || text[i];
  }
  return result.toLowerCase();
}

function generateSlugFromTitle(title, postId) {
  if (!title || typeof title !== 'string') return 'post-' + postId;
  let slug = transliterateCyrillic(title);
  slug = slug.replace(/[^a-z0-9\s-]/g, '');
  slug = slug.replace(/[\s-]+/g, '-');
  slug = slug.replace(/^-+|-+$/g, '');
  if (slug.length > 80) slug = slug.substring(0, 80).replace(/-+$/, '');
  if (!slug || slug.length < 3) slug = 'post-' + postId;
  return slug + '-' + postId;
}

function extractNumericId(postId) {
  if (!postId) return '0';
  const str = String(postId);
  if (str.includes('/')) {
    const parts = str.split('/');
    return parts[parts.length - 1].replace(/[^0-9]/g, '') || '0';
  }
  return str.replace(/[^0-9]/g, '') || '0';
}

const STOP_WORDS = new Set([
  'и','в','во','не','что','он','на','я','с','со','как','а','то','все','она','так','его',
  'но','да','ты','к','у','уже','вы','за','бы','по','только','её','мне','было','вот','от',
  'the','and','for','are','but','not','you','all','can','had','her','was','one','our','out',
  'have','been','will','your','its','from','they','this','that','with','just','what','when'
]);

function extractKeywordsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const cleaned = text.replace(/#\w+/g, '').replace(/@\w+/g, '').replace(/https?:\/\/[^\s]+/g, '').toLowerCase();
  const words = cleaned.split(/[^a-zа-яё0-9]+/g);
  const filtered = words.filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(filtered)].slice(0, 15);
}

function generateHashtagsFromKeywords(keywords) {
  if (!keywords || keywords.length === 0) return ['#мебель', '#кухни', '#Абакан'];
  const hashtags = [];
  const seen = new Set();
  for (let i = 0; i < keywords.length && hashtags.length < CONFIG.MAX_HASHTAGS_PER_POST; i++) {
    const keyword = keywords[i];
    if (keyword.length < CONFIG.HASHTAG_MIN_LENGTH) continue;
    const hashtag = '#' + keyword.toLowerCase().replace(/[^a-zа-яё0-9]/g, '');
    if (!seen.has(hashtag)) { seen.add(hashtag); hashtags.push(hashtag); }
  }
  if (hashtags.length < 3) {
    const defaults = ['#мебель', '#кухни', '#Абакан', '#шкафы', '#ремонт'];
    for (const def of defaults) {
      if (!seen.has(def) && hashtags.length < CONFIG.MAX_HASHTAGS_PER_POST) hashtags.push(def);
    }
  }
  return hashtags.slice(0, CONFIG.MAX_HASHTAGS_PER_POST);
}

function formatPostText(text, lang = 'ru') {
  if (!text || typeof text !== 'string') return '';
  let formatted = escapeHTML(text);
  formatted = formatted.replace(/\n/g, '<br>');
  const urlPlaceholders = [];
  formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, (match) => {
    urlPlaceholders.push(match);
    return `%%URL_${urlPlaceholders.length - 1}%%`;
  });
  formatted = formatted.replace(/#([\p{L}\p{N}_]+)/gu, (match, hashtag) => {
    const tagUrl = `${CONFIG.SITE_URL}/${lang === 'en' ? 'en/' : ''}tag/${encodeURIComponent(hashtag)}`;
    return `<a href="${tagUrl}" class="hashtag" data-hashtag="${hashtag}">#${hashtag}</a>`;
  });
  formatted = formatted.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  formatted = formatted.replace(/%%URL_(\d+)%%/g, (match, idx) => {
    const url = urlPlaceholders[parseInt(idx, 10)];
    return url ? `<a href="${url}" target="_blank" rel="noopener">${url}</a>` : match;
  });
  return formatted;
}

function generateSmartDescription(text, lang = 'ru') {
  const currentYear = getCurrentYear();
  if (!text || typeof text !== 'string') {
    return lang === 'ru'
      ? 'Мебель на заказ в Абакане и Хакасии. Кухни, шкафы-купе, гарантия 3 года. ' + currentYear + '.'
      : 'Custom furniture in Abakan and Khakassia. Kitchens, wardrobes, 3-year warranty. ' + currentYear + '.';
  }
  let cleanText = text.replace(/#\w+/g, '').replace(/@\w+/g, '').replace(/https?:\/\/[^\s]+/g, '').replace(/\s+/g, ' ').trim();
  if (cleanText.length <= 155) return cleanText;
  let endPos = cleanText.lastIndexOf('.', 155);
  if (endPos !== -1 && endPos >= 50) return cleanText.substring(0, endPos + 1);
  endPos = cleanText.lastIndexOf(' ', 155);
  if (endPos === -1) endPos = 155;
  return cleanText.substring(0, endPos) + '...';
}

// ============================================================
// POST TRANSFORMATION
// ============================================================
function transformGitHubPost(post, index) {
  if (!post) post = {};
  let numericId = '';
  const postIdStr = String(post.id || '');
  if (postIdStr) numericId = postIdStr.includes('/') ? postIdStr.split('/')[1] : postIdStr;
  else if (post.message_id) numericId = post.message_id.toString();
  else if (post.post_id) numericId = post.post_id.toString();
  else numericId = (post.date ? new Date(post.date).getTime() : Date.now()) + '_' + index;
  numericId = numericId.toString().replace(/[^0-9]/g, '') || String(Date.now() + index);

  let date = post.date ? new Date(post.date) : new Date();
  if (Number.isNaN(date.getTime())) date = new Date();

  const media = [];
  if (post.photo_urls && Array.isArray(post.photo_urls)) {
    for (let i = 0; i < Math.min(post.photo_urls.length, CONFIG.MAX_MEDIA_PER_POST); i++) {
      media.push({ type: 'photo', directUrl: post.photo_urls[i], width: 800, height: 600 });
    }
  } else if (post.photo_url || post.photo || post.image_url || post.image) {
    media.push({ type: 'photo', directUrl: post.photo_url || post.photo || post.image_url || post.image, width: 800, height: 600 });
  }
  if (post.video_urls && Array.isArray(post.video_urls)) {
    for (let i = 0; i < Math.min(post.video_urls.length, CONFIG.MAX_MEDIA_PER_POST - media.length); i++) {
      media.push({
        type: 'video', directUrl: post.video_urls[i], width: 1280, height: 720,
        poster: post.video_thumbnails && post.video_thumbnails[i] ? post.video_thumbnails[i] : null
      });
    }
  } else if (post.video_url || post.video) {
    media.push({
      type: 'video', directUrl: post.video_url || post.video, width: 1280, height: 720,
      poster: post.video_thumbnail || post.thumbnail_url || post.photo_url || null
    });
  }

  let instagramUrl = null;
  if (media.length === 0) {
    const linksArray = post.links || [];
    for (const link of linksArray) {
      if (link && link.includes('instagram.com/p/')) { instagramUrl = link; break; }
    }
    if (!instagramUrl) {
      const igMatch = (post.text || '').match(/https?:\/\/(?:www\.)?instagram\.com\/p\/([A-Za-z0-9_-]+)/);
      if (igMatch) instagramUrl = igMatch[0];
    }
    if (instagramUrl) {
      media.push({
        type: 'instagram', directUrl: instagramUrl,
        instagramShortcode: instagramUrl.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1] || '',
        width: 800, height: 600
      });
    }
  }

  const textClean = (post.text || post.content || post.message || post.description || '').replace(/[\r\n]+/g, ' ').trim();
  const title = textClean.length > 50 ? textClean.substring(0, 50).replace(/\s+$/, '') + '...' : (textClean || 'Проект мебели');
  const slug = generateSlugFromTitle(title, numericId);
  const keywords = extractKeywordsFromText(textClean);
  const hashtags = generateHashtagsFromKeywords(keywords);
  const textWithHashtags = textClean + (hashtags.length > 0 ? '\n\n' + hashtags.join(' ') : '');
  const numericPostId = extractNumericId(numericId);
  const telegramLink = CONFIG.TELEGRAM_WEB + '/' + numericPostId;
  const postUrl = CONFIG.SITE_URL + '/post/' + numericPostId;
  const postUrlEn = CONFIG.SITE_URL + '/en/post/' + numericPostId;
  const ampUrl = CONFIG.SITE_URL + '/post/' + numericPostId + '/amp';
  const ampUrlEn = CONFIG.SITE_URL + '/en/post/' + numericPostId + '/amp';

  return {
    id: numericPostId, originalId: post.id || numericPostId, slug, numericId: numericPostId,
    date, text: textClean, textWithHashtags, title, media, hasMedia: media.length > 0,
    mediaCount: media.length, instagramUrl, telegramLink, postUrl, postUrlEn, ampUrl, ampUrlEn,
    keywords, hashtags
  };
}

// ============================================================
// SVG ICONS
// ============================================================
const TELEGRAM_LOGO_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.097-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472z" fill="currentColor"/></svg>`;

const WHATSAPP_LOGO_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.001 2.004c-5.516 0-9.999 4.483-9.999 9.999 0 1.766.465 3.491 1.347 5.003L2.002 22l5.128-1.346c1.462.8 3.115 1.227 4.871 1.227 5.516 0 9.999-4.483 9.999-9.999s-4.483-9.999-9.999-9.999zm0 17.998c-1.586 0-3.141-.404-4.514-1.173l-.324-.183-3.356.881.898-3.271-.211-.336c-.846-1.347-1.292-2.914-1.292-4.521 0-4.412 3.588-7.999 8.001-7.999 2.148 0 4.167.837 5.682 2.351 1.514 1.515 2.351 3.534 2.351 5.681-.001 4.413-3.589 8.001-8.001 8.001z" fill="currentColor"/><path d="M16.753 14.428c-.246-.123-1.454-.716-1.68-.797-.226-.082-.39-.123-.554.123-.164.246-.636.797-.779.961-.143.164-.287.184-.533.061-.246-.123-1.039-.383-1.981-1.218-.733-.65-1.228-1.454-1.371-1.699-.143-.246-.015-.379.108-.501.111-.111.246-.287.369-.43.123-.143.164-.246.246-.41.082-.164.041-.307-.021-.43-.061-.123-.554-1.332-.759-1.824-.199-.477-.402-.412-.554-.419-.143-.007-.307-.007-.471-.007-.164 0-.43.061-.656.307-.226.246-.86.84-.86 2.049 0 1.209.881 2.377 1.004 2.54.123.164 1.736 2.652 4.205 3.718.588.253 1.045.404 1.402.517.589.187 1.125.16 1.548.098.471-.07 1.454-.595 1.66-1.169.205-.574.205-1.066.144-1.169-.062-.102-.226-.164-.472-.287z" fill="currentColor"/></svg>`;

const PHONE_LOGO_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="currentColor"/></svg>`;

const SERVICE_ICONS = {
  kitchen: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="4" y="8" width="24" height="20" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><rect x="7" y="11" width="8" height="7" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="17" y="11" width="8" height="7" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="7" y="20" width="18" height="6" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="11" cy="14.5" r="1" fill="currentColor"/><circle cx="21" cy="14.5" r="1" fill="currentColor"/></svg>`,
  wardrobe: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="5" y="4" width="22" height="24" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="16" y1="4" x2="16" y2="28" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="14" r="1.5" fill="currentColor"/><circle cx="20" cy="14" r="1.5" fill="currentColor"/></svg>`,
  hallway: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="4" y="6" width="24" height="22" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><rect x="7" y="9" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="17" y="9" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="11" cy="13" r="1" fill="currentColor"/><circle cx="21" cy="13" r="1" fill="currentColor"/></svg>`,
  living: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="3" y="10" width="26" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><rect x="6" y="13" width="8" height="6" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="16" y="13" width="10" height="6" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
  kids: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="10" r="5" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 26c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="currentColor" stroke-width="2" fill="none"/></svg>`,
  bathroom: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="4" y="8" width="24" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><rect x="7" y="11" width="18" height="5" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="16" cy="20" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`
};

const FEATURE_ICONS = {
  experience: `<svg width="36" height="36" viewBox="0 0 36 36" fill="none"><circle cx="18" cy="18" r="16" stroke="currentColor" stroke-width="2.5" fill="none"/><path d="M18 9v10l6 3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  measurement: `<svg width="36" height="36" viewBox="0 0 36 36" fill="none"><rect x="5" y="12" width="26" height="12" rx="2" stroke="currentColor" stroke-width="2.5" fill="none"/><path d="M9 18h4M15 18h4M21 18h4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  design: `<svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M18 5l3.5 7.5L29 14l-5.5 5.5L25 27l-7-3.5L11 27l1.5-7.5L7 14l7.5-1.5L18 5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>`,
  materials: `<svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M18 6l12 6v12l-12 6-12-6V12l12-6z" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linejoin="round"/><path d="M18 12v12M12 15l6 3 6-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  warranty: `<svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M18 5l10 4v8c0 6-4.5 10-10 12-5.5-2-10-6-10-12V9l10-4z" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linejoin="round"/><path d="M13 18l3 3 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  delivery: `<svg width="36" height="36" viewBox="0 0 36 36" fill="none"><rect x="4" y="12" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2.5" fill="none"/><path d="M24 18h6l-3 6h-3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="26" r="3" stroke="currentColor" stroke-width="2.5" fill="none"/><circle cx="24" cy="26" r="3" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>`
};

// ============================================================
// LANGUAGE CONFIG
// ============================================================
const LANGUAGES = {
  ru: {
    code: 'ru', companyName: 'АбаканМебель',
    heroTitle: 'Кухни и шкафы-купе', heroHighlight: 'на заказ в Абакане',
    heroSubtitle: 'Создаём мебель вашей мечты по индивидуальным размерам. Бесплатный замер, 3D проект, гарантия 3 года',
    heroFeatures: ['Бесплатный замер по Хакасии', '3D дизайн-проект бесплатно', 'Гарантия 3 года', 'Срок от 14 дней'],
    heroCTA: 'Заказать бесплатный проект', heroCall: 'Позвонить сейчас',
    statsYears: 'лет опыта', statsGift: 'проект в подарок', statsWarranty: 'года гарантии', statsFreeMeasure: 'замеры бесплатно',
    navServices: 'Услуги', navProjects: 'Портфолио', navAbout: 'О компании', navFAQ: 'Вопросы', navContact: 'Контакты', navHome: 'Главная',
    servicesTitle: 'Наши услуги по изготовлению мебели',
    servicesSubtitle: 'Профессиональное изготовление мебели любой сложности на заказ в Абакане и Республике Хакасия',
    feedTitle: 'Лента проектов', feedSubtitle: 'Последние выполненные работы',
    aboutTitle: 'Почему выбирают АбаканМебель',
    aboutFeatures: {
      experience: { title: '25 лет опыта', desc: 'На рынке мебели с 1999 года', icon: 'experience' },
      measurement: { title: 'Бесплатный замер', desc: 'По всей Республике Хакасия', icon: 'measurement' },
      design: { title: '3D дизайн-проект', desc: 'Визуализация бесплатно', icon: 'design' },
      materials: { title: 'Качественные материалы', desc: 'Egger, Kronospan, Blum', icon: 'materials' },
      warranty: { title: 'Гарантия 3 года', desc: 'На все изделия и монтаж', icon: 'warranty' },
      delivery: { title: 'Доставка и монтаж', desc: 'Профессиональная установка', icon: 'delivery' }
    },
    faqTitle: 'Часто задаваемые вопросы',
    contactTitle: 'Готовы заказать мебель мечты?',
    contactSubtitle: 'Свяжитесь с нами любым удобным способом — консультация бесплатно',
    footerRights: 'Все права защищены',
    postHomeBtn: 'На главную', postTelegramBtn: 'В Telegram',
    relatedPostsTitle: 'Рекомендуемые проекты', relatedPostsSubtitle: 'Посмотрите другие наши работы',
    btnLoadMore: 'Загрузить ещё', btnAllLoaded: 'Все посты загружены',
    popularTagsTitle: 'Популярные теги', tagTitle: 'Проекты по тегу', tagPostsFound: 'Найдено проектов',
    pageXofY: 'Страница {X} из {Y}', pagePrev: 'Назад', pageNext: 'Вперёд',
    faqItems: [
      { q: "Сколько стоит кухня на заказ в Абакане?", a: "Стоимость зависит от размеров, материалов и фурнитуры. Средняя цена кухни от 45 000 рублей. Бесплатный расчёт после замера." },
      { q: "Какой срок изготовления кухни?", a: "Срок изготовления от 14 до 31 дня в зависимости от сложности проекта и выбранных материалов." },
      { q: "Делаете ли бесплатный замер?", a: "Да, бесплатный замер по всей Республике Хакасия. Выезжаем в Абакан, Черногорск, Саяногорск и другие города." },
      { q: "Какая гарантия на мебель?", a: "Гарантия 3 года на все изделия. Фурнитура Blum с гарантией до 5 лет. Гарантия распространяется на монтаж." }
    ],
    services: [
      { icon: 'kitchen', title: 'Кухни на заказ', desc: 'Угловые, прямые, П-образные кухни из МДФ, пластика, массива дерева', price: 'от 45 000 ₽' },
      { icon: 'wardrobe', title: 'Шкафы-купе', desc: 'Встроенные и корпусные шкафы с системами Aristo, Versailles', price: 'от 25 000 ₽' },
      { icon: 'hallway', title: 'Прихожие', desc: 'Компактные и вместительные решения для любых помещений', price: 'от 18 000 ₽' },
      { icon: 'living', title: 'Гостиные', desc: 'Стенки, горки, ТВ-тумбы, модульные системы на заказ', price: 'от 22 000 ₽' },
      { icon: 'kids', title: 'Детские комнаты', desc: 'Безопасная мебель из экологичных материалов для детей', price: 'от 20 000 ₽' },
      { icon: 'bathroom', title: 'Мебель для ванной', desc: 'Влагостойкие тумбы, пеналы, зеркала с подсветкой', price: 'от 15 000 ₽' }
    ]
  },
  en: {
    code: 'en', companyName: 'AbakanMebel',
    heroTitle: 'Custom Kitchens & Wardrobes', heroHighlight: 'made in Abakan',
    heroSubtitle: 'Creating furniture of your dreams to individual measurements. Free measurement, 3D design, 3-year warranty',
    heroFeatures: ['Free measurement in Khakassia', '3D design project free', '3-year warranty', 'Production from 14 days'],
    heroCTA: 'Order Free Project', heroCall: 'Call Now',
    statsYears: 'years experience', statsGift: 'project as gift', statsWarranty: 'year warranty', statsFreeMeasure: 'free measurements',
    navServices: 'Services', navProjects: 'Portfolio', navAbout: 'About', navFAQ: 'FAQ', navContact: 'Contact', navHome: 'Home',
    servicesTitle: 'Our Custom Furniture Services',
    servicesSubtitle: 'Professional custom furniture manufacturing of any complexity in Abakan and Republic of Khakassia',
    feedTitle: 'Project Feed', feedSubtitle: 'Latest completed works',
    aboutTitle: 'Why Choose AbakanMebel',
    aboutFeatures: {
      experience: { title: '25 Years Experience', desc: 'On the furniture market since 1999', icon: 'experience' },
      measurement: { title: 'Free Measurement', desc: 'Throughout Republic of Khakassia', icon: 'measurement' },
      design: { title: '3D Design Project', desc: 'Visualization free of charge', icon: 'design' },
      materials: { title: 'Quality Materials', desc: 'Egger, Kronospan, Blum', icon: 'materials' },
      warranty: { title: '3-Year Warranty', desc: 'On all products and installation', icon: 'warranty' },
      delivery: { title: 'Delivery & Assembly', desc: 'Professional installation', icon: 'delivery' }
    },
    faqTitle: 'Frequently Asked Questions',
    contactTitle: 'Ready to Order Your Dream Furniture?',
    contactSubtitle: 'Contact us in any convenient way — consultation is free',
    footerRights: 'All rights reserved',
    postHomeBtn: 'Go Home', postTelegramBtn: 'In Telegram',
    relatedPostsTitle: 'Recommended Projects', relatedPostsSubtitle: 'Check out our other works',
    btnLoadMore: 'Load More', btnAllLoaded: 'All posts loaded',
    popularTagsTitle: 'Popular Tags', tagTitle: 'Projects tagged', tagPostsFound: 'projects found',
    pageXofY: 'Page {X} of {Y}', pagePrev: 'Previous', pageNext: 'Next',
    faqItems: [
      { q: "How much does a custom kitchen cost in Abakan?", a: "Cost depends on size, materials and hardware. Average kitchen price from 45,000 rubles. Free calculation after measurement." },
      { q: "What is the kitchen production time?", a: "Production time from 14 to 31 days depending on project complexity and selected materials." },
      { q: "Do you offer free measurement?", a: "Yes, free measurement throughout Republic of Khakassia." },
      { q: "What warranty do you provide?", a: "3-year warranty on all products. Blum hardware with up to 5-year warranty." }
    ],
    services: [
      { icon: 'kitchen', title: 'Custom Kitchens', desc: 'Corner, straight, U-shaped kitchens from MDF, plastic, solid wood', price: 'from 45,000 ₽' },
      { icon: 'wardrobe', title: 'Sliding Wardrobes', desc: 'Built-in and freestanding wardrobes with Aristo, Versailles systems', price: 'from 25,000 ₽' },
      { icon: 'hallway', title: 'Hallways', desc: 'Compact and spacious solutions for any space', price: 'from 18,000 ₽' },
      { icon: 'living', title: 'Living Rooms', desc: 'Wall units, TV stands, modular systems custom made', price: 'from 22,000 ₽' },
      { icon: 'kids', title: 'Children Rooms', desc: 'Safe furniture from eco-friendly materials for kids', price: 'from 20,000 ₽' },
      { icon: 'bathroom', title: 'Bathroom Furniture', desc: 'Moisture-resistant cabinets, mirrors with lighting', price: 'from 15,000 ₽' }
    ]
  }
};

// ============================================================
// HTML COMPONENTS
// ============================================================
function getHeaderHTML(lang, navType = 'home') {
  const t = LANGUAGES[lang];
  const langPrefix = lang === 'en' ? '/en' : '';
  const homeUrl = CONFIG.SITE_URL + langPrefix + '/';
  let navLinks;
  if (navType === 'home') {
    navLinks = `
      <a href="${langPrefix}/#services" class="nav__link"><span>${t.navServices}</span></a>
      <a href="${langPrefix}/#projects" class="nav__link"><span>${t.navProjects}</span></a>
      <a href="${langPrefix}/#about" class="nav__link"><span>${t.navAbout}</span></a>
      <a href="${langPrefix}/#faq" class="nav__link"><span>${t.navFAQ}</span></a>
      <a href="${langPrefix}/#contact" class="nav__link"><span>${t.navContact}</span></a>`;
  } else {
    navLinks = `
      <a href="${homeUrl}" class="nav__link"><span>${t.navHome}</span></a>
      <a href="${homeUrl}#services" class="nav__link"><span>${t.navServices}</span></a>
      <a href="${homeUrl}#projects" class="nav__link"><span>${t.navProjects}</span></a>
      <a href="${homeUrl}#contact" class="nav__link"><span>${t.navContact}</span></a>`;
  }
  return `<header class="header" id="header">
    <div class="container header__container">
      <a href="${homeUrl}" class="logo">
        <img src="${CONFIG.SITE_URL}/logo.png" alt="${t.companyName}" class="logo__img" width="48" height="48">
        <div class="logo__text">
          <span class="logo__title">${t.companyName}</span>
          <span class="logo__subtitle">${lang === 'ru' ? 'Кухни и шкафы на заказ' : 'Custom Kitchens & Wardrobes'}</span>
        </div>
      </a>
      <nav class="nav" id="nav">${navLinks}</nav>
      <div class="header__actions">
        <div class="lang-switcher">
          <a href="${CONFIG.SITE_URL}/" class="lang-btn ${lang === 'ru' ? 'active' : ''}">RU</a>
          <a href="${CONFIG.SITE_URL}/en/" class="lang-btn ${lang === 'en' ? 'active' : ''}">EN</a>
        </div>
        <button class="theme-toggle" id="themeToggle" aria-label="Toggle theme">&#9728;&#65039;</button>
        <a href="${CONFIG.TELEGRAM_PHONE}" class="btn-telegram-circle" target="_blank" rel="noopener" aria-label="Telegram">${TELEGRAM_LOGO_SVG}</a>
      </div>
    </div>
  </header>`;
}

function getFooterHTML(lang, posts) {
  const t = LANGUAGES[lang];
  const currentYear = getCurrentYear();
  const tags = getPopularTags(posts);
  let tagsHTML = '';
  if (tags && tags.length > 0) {
    tagsHTML = `\n<div class="footer-tags">\n<div class="footer-tags-title">${t.popularTagsTitle}</div>\n<div class="footer-tags-list">\n` +
      tags.map(tag => {
        const tagUrl = lang === 'ru' ? `/tag/${encodeURIComponent(tag)}` : `/en/tag/${encodeURIComponent(tag)}`;
        return `<a href="${tagUrl}" class="footer-tag">#${escapeHTML(tag)}</a>`;
      }).join('') + '\n</div>\n</div>';
  }
  return `<footer class="footer">\n<div class="container footer__bottom">\n<p>&copy; ${currentYear} ${t.companyName}. ${t.footerRights}.</p>${tagsHTML}\n</div>\n</footer>`;
}

function getFloatingButtonsHTML() {
  return `<a href="${CONFIG.TELEGRAM_PHONE}" target="_blank" rel="noopener" class="floating-btn" aria-label="Telegram">${TELEGRAM_LOGO_SVG}</a>
  <button class="scroll-to-top" id="scrollToTop" aria-label="Scroll to top">&uarr;</button>`;
}

function getCommonHeadHTML(title, description, keywords, canonicalUrl, lang, extraHead = '') {
  const t = LANGUAGES[lang];
  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title)}</title>
  <meta name="description" content="${escapeHTML(description)}">
  <meta name="keywords" content="${escapeHTML(keywords)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="author" content="${t.companyName}">
  <meta name="publisher" content="${t.companyName}">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="preload" href="${CONFIG.LOGO_URL}" as="image">
  <link rel="icon" href="${CONFIG.SITE_URL}/favicon.ico">
  <link rel="apple-touch-icon" href="${CONFIG.LOGO_URL}">
  <link rel="manifest" href="/manifest.json">
  <link rel="alternate" hreflang="ru" href="${CONFIG.SITE_URL}">
  <link rel="alternate" hreflang="en" href="${CONFIG.SITE_URL}/en/">
  <link rel="alternate" hreflang="x-default" href="${CONFIG.SITE_URL}">
  <meta name="theme-color" content="#6366f1">
  <link rel="stylesheet" href="/css/style.css">
  ${extraHead}`;
}

function getClientJS(lang) {
  const matrixKeywords = JSON.stringify(CONFIG.NEWS_KEYWORDS.slice(0, 50).map(k => '#' + k));
  return `<script src="/js/main.js"></script>
  <script>
  (function() {
    var MATRIX_KEYWORDS = ${matrixKeywords};
    var LANG = '${lang}';
    window.ABAKAN_LANG = LANG;
    if (typeof window.initAbakanMebel === 'function') window.initAbakanMebel(MATRIX_KEYWORDS);
  })();
  </script>`;
}

// ============================================================
// POSTS HTML GENERATION
// ============================================================
function generatePostsHTML(posts, lang) {
  if (!posts || posts.length === 0) return '';
  return posts.map(post => {
    let mediaBlock = '';
    if (post.hasMedia && post.media && post.media.length > 0) {
      const media = post.media[0];
      mediaBlock = `\n<div class="post-feed-media">\n<div class="post-feed-media-item">\n`;
      if (media.type === 'instagram') {
        const igText = lang === 'ru' ? 'Смотреть в Instagram' : 'View on Instagram';
        mediaBlock += `<a href="${escapeHTML(media.directUrl)}" target="_blank" rel="noopener" class="instagram-embed__link">
          <div class="instagram-embed__placeholder instagram-embed__placeholder--card">
          <svg class="instagram-embed__icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/></svg>
          <span class="instagram-embed__text">${igText}</span></div></a>\n`;
      } else if (media.type === 'video') {
        mediaBlock += `<div class="video-container">
          <div class="video-thumbnail" data-video-src="${escapeHTML(getProxyMediaUrl(media.directUrl))}" data-video-title="${escapeHTML(post.title)}" data-video-type="video/mp4">
          <img src="${escapeHTML(getProxyMediaUrl(media.poster || CONFIG.LOGO_URL))}" alt="${escapeHTML(post.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" crossorigin="anonymous">
          </div></div>\n`;
      } else {
        mediaBlock += `<img src="${escapeHTML(getProxyMediaUrl(media.directUrl))}" alt="${escapeHTML(post.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" crossorigin="anonymous">\n`;
      }
      mediaBlock += `</div>\n</div>`;
    }
    // Media count badge for posts with multiple media items
    let mediaCountBadge = '';
    if (post.mediaCount > 1) {
      const photoCount = post.media.filter(m => m.type === 'photo').length;
      const videoCount = post.media.filter(m => m.type === 'video').length;
      let badgeText = '';
      if (photoCount > 0 && videoCount > 0) {
        badgeText = lang === 'ru'
          ? `🎬 ${videoCount} видео + 📷 ${photoCount} фото`
          : `🎬 ${videoCount} video + 📷 ${photoCount} photo`;
      } else if (videoCount > 0) {
        badgeText = lang === 'ru' ? `🎬 ${videoCount} видео` : `🎬 ${videoCount} video`;
      } else {
        badgeText = lang === 'ru' ? `📷 ${photoCount} фото` : `📷 ${photoCount} photo`;
      }
      mediaCountBadge = `<span class="media-count-badge">${badgeText}</span>`;
    }
    const postUrl = lang === 'ru' ? post.postUrl : post.postUrlEn;
    const ampUrl = lang === 'ru' ? post.ampUrl : post.ampUrlEn;
    const dateStr = new Date(post.date).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const textToDisplay = post.textWithHashtags || post.text || '';
    const btnRead = lang === 'ru' ? 'Читать' : 'Read';
    return `<article class="post-feed-item" data-post-id="${escapeHTML(post.id.toString())}">
      ${mediaBlock}
      ${mediaCountBadge}
      <div class="post-feed-content">
        <div class="post-feed-meta">
          <span>&#128197; ${dateStr}</span>
          <a href="${ampUrl}" class="amp-badge">AMP</a>
        </div>
        <h3 class="post-feed-title"><a href="${postUrl}">${escapeHTML(post.title)}</a></h3>
        <div class="post-feed-text">${formatPostText(textToDisplay, lang)}</div>
        <div class="post-feed-actions">
          <a href="${postUrl}" class="btn btn-read">${btnRead}</a>
          <a href="${post.telegramLink}" target="_blank" rel="noopener" class="btn btn-telegram">Telegram</a>
        </div>
      </div>
    </article>`;
  }).join('\n');
}

function generateGalleryHTML(post, lang) {
  if (!post || !post.media || post.media.length === 0) return '';
  let html = `<div class="post-gallery" data-post-id="${escapeHTML(post.id.toString())}">\n`;
  for (let i = 0; i < post.media.length; i++) {
    const media = post.media[i];
    const loading = i === 0 ? 'eager' : 'lazy';
    const fetchPriority = i === 0 ? 'high' : 'auto';
    html += '<div class="gallery-item">\n';
    if (media.type === 'instagram') {
      html += `<div class="instagram-embed" data-instagram-url="${escapeHTML(media.directUrl)}">
        <a href="${escapeHTML(media.directUrl)}" target="_blank" rel="noopener" class="instagram-embed__link">
        <div class="instagram-embed__placeholder">
        <svg class="instagram-embed__icon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/></svg>
        <span class="instagram-embed__text">${lang === 'ru' ? 'Смотреть в Instagram' : 'View on Instagram'}</span>
        </div></a>
        ${media.instagramShortcode ? `<iframe class="instagram-embed__iframe" src="https://www.instagram.com/p/${escapeHTML(media.instagramShortcode)}/embed/" frameborder="0" scrolling="no" allowtransparency="true" loading="lazy" title="Instagram embed"></iframe>` : ''}
        </div>\n`;
    } else if (media.type === 'video') {
      html += `<video src="${escapeHTML(getProxyMediaUrl(media.directUrl))}" poster="${escapeHTML(getProxyMediaUrl(media.poster || CONFIG.LOGO_URL))}" preload="metadata" controls playsinline referrerpolicy="no-referrer" crossorigin="anonymous">
        <source src="${escapeHTML(getProxyMediaUrl(media.directUrl))}" type="video/mp4"></video>\n`;
    } else {
      html += `<img src="${escapeHTML(getProxyMediaUrl(media.directUrl))}" alt="${escapeHTML(post.title)} ${i + 1}" loading="${loading}" fetchpriority="${fetchPriority}" referrerpolicy="no-referrer" crossorigin="anonymous" />\n`;
    }
    html += '</div>\n';
  }
  html += '</div>';
  return html;
}

// ============================================================
// PAGINATION
// ============================================================
function generatePaginationHTML(currentPage, totalPages, lang, basePath) {
  if (totalPages <= 1) return '';
  const t = LANGUAGES[lang];
  const langPrefix = lang === 'en' ? '/en' : '';
  const MAX_VISIBLE = 7;

  function getPageUrl(pageNum) {
    if (pageNum === 1) return langPrefix + basePath;
    return langPrefix + basePath + 'page/' + pageNum + '/';
  }

  let html = '<nav class="pagination" aria-label="Pagination">';

  // Prev button
  if (currentPage > 1) {
    html += `<a href="${getPageUrl(currentPage - 1)}" class="pagination__link pagination__prev" rel="prev">&laquo; ${t.pagePrev}</a>`;
  }

  // Page buttons with ellipsis logic
  const pages = [];
  if (totalPages <= MAX_VISIBLE) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    let start = Math.max(2, currentPage - 2);
    let end = Math.min(totalPages - 1, currentPage + 2);
    if (currentPage <= 3) { start = 2; end = 5; }
    if (currentPage >= totalPages - 2) { start = totalPages - 4; end = totalPages - 1; }
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('...');
    pages.push(totalPages);
  }

  for (const p of pages) {
    if (p === '...') {
      html += '<span class="pagination__dots">&hellip;</span>';
    } else if (p === currentPage) {
      html += `<span class="pagination__current">${p}</span>`;
    } else {
      html += `<a href="${getPageUrl(p)}" class="pagination__link">${p}</a>`;
    }
  }

  // Next button
  if (currentPage < totalPages) {
    html += `<a href="${getPageUrl(currentPage + 1)}" class="pagination__link pagination__next" rel="next">${t.pageNext} &raquo;</a>`;
  }

  html += '</nav>';
  return html;
}

function generateListingPage(posts, lang, pageNum, totalPages, totalPosts, tag) {
  const t = LANGUAGES[lang];
  const langPrefix = lang === 'en' ? '/en' : '';
  const homeUrl = CONFIG.SITE_URL + langPrefix + '/';
  const pagePosts = posts.slice((pageNum - 1) * CONFIG.POSTS_PER_PAGE, pageNum * CONFIG.POSTS_PER_PAGE);
  const pageCounter = t.pageXofY.replace('{X}', pageNum).replace('{Y}', totalPages) + ' (' + totalPosts + (lang === 'ru' ? ' проектов)' : ' projects)');

  let title, description, canonicalUrl, breadcrumbSchema;
  if (tag) {
    title = `#${tag} — ${lang === 'ru' ? 'Страница' : 'Page'} ${pageNum} | ${t.companyName}`;
    description = lang === 'ru'
      ? `Проекты по тегу #${tag}, страница ${pageNum}. Найдено ${totalPosts} работ.`
      : `Projects tagged #${tag}, page ${pageNum}. Found ${totalPosts} works.`;
    canonicalUrl = lang === 'ru'
      ? `${CONFIG.SITE_URL}/tag/${encodeURIComponent(tag)}/page/${pageNum}`
      : `${CONFIG.SITE_URL}/en/tag/${encodeURIComponent(tag)}/page/${pageNum}`;
    breadcrumbSchema = generateBreadcrumbSchema([
      { name: t.companyName, url: homeUrl },
      { name: '#' + tag, url: lang === 'ru' ? `${CONFIG.SITE_URL}/tag/${encodeURIComponent(tag)}` : `${CONFIG.SITE_URL}/en/tag/${encodeURIComponent(tag)}` },
      { name: `${lang === 'ru' ? 'Страница' : 'Page'} ${pageNum}`, url: canonicalUrl }
    ]);
  } else {
    title = `${t.feedTitle} — ${lang === 'ru' ? 'Страница' : 'Page'} ${pageNum} | ${t.companyName}`;
    description = lang === 'ru'
      ? `Лента проектов, страница ${pageNum} из ${totalPages}. Всего ${totalPosts} проектов.`
      : `Project feed, page ${pageNum} of ${totalPages}. Total ${totalPosts} projects.`;
    canonicalUrl = lang === 'ru'
      ? `${CONFIG.SITE_URL}/page/${pageNum}`
      : `${CONFIG.SITE_URL}/en/page/${pageNum}`;
    breadcrumbSchema = generateBreadcrumbSchema([
      { name: t.companyName, url: homeUrl },
      { name: `${lang === 'ru' ? 'Страница' : 'Page'} ${pageNum}`, url: canonicalUrl }
    ]);
  }

  const basePath = tag ? `/tag/${encodeURIComponent(tag)}/` : '/';
  const prevUrl = pageNum > 1
    ? (pageNum === 2 ? (lang === 'en' ? '/en' + (tag ? `/tag/${encodeURIComponent(tag)}` : '') + '/' : (tag ? `/tag/${encodeURIComponent(tag)}` : '') + '/') : (lang === 'en' ? '/en' : '') + (tag ? `/tag/${encodeURIComponent(tag)}` : '') + `/page/${pageNum - 1}/`)
    : null;
  const nextUrl = pageNum < totalPages
    ? (lang === 'en' ? '/en' : '') + (tag ? `/tag/${encodeURIComponent(tag)}` : '') + `/page/${pageNum + 1}/`
    : null;

  let relLinks = '';
  if (pageNum > 1) {
    const prevCanonical = pageNum === 2
      ? (tag ? (lang === 'en' ? `${CONFIG.SITE_URL}/en/tag/${encodeURIComponent(tag)}` : `${CONFIG.SITE_URL}/tag/${encodeURIComponent(tag)}`) : (lang === 'en' ? `${CONFIG.SITE_URL}/en/` : `${CONFIG.SITE_URL}`))
      : canonicalUrl.replace(/\/page\/\d+\/$/, `/page/${pageNum - 1}/`);
    relLinks += `<link rel="prev" href="${prevCanonical}">`;
  }
  if (pageNum < totalPages) {
    const nextCanonical = canonicalUrl.replace(/\/page\/\d+\/$/, `/page/${pageNum + 1}/`);
    relLinks += `<link rel="next" href="${nextCanonical}">`;
  }

  const extraHead = `<meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${escapeHTML(title)}">
  <meta property="og:description" content="${escapeHTML(description)}">
  <meta property="og:image" content="${CONFIG.LOGO_URL}">
  <meta property="og:site_name" content="${t.companyName}">
  <meta name="twitter:card" content="summary_large_image">
  ${generateExtraSEOMeta(CONFIG.LOGO_URL, lang)}
  ${relLinks}
  <script type="application/ld+json">${STATIC_ORG_SCHEMA}</script>
  <script type="application/ld+json">${generateWebSiteSchema(lang)}</script>
  <script type="application/ld+json">${breadcrumbSchema}</script>
  <script type="application/ld+json">${generateItemListSchema(pagePosts, lang)}</script>`;

  return `<!DOCTYPE html>
<html lang="${lang}" data-theme="${CONFIG.DEFAULT_THEME}">
<head>
  ${getCommonHeadHTML(title, description, CONFIG.NEWS_KEYWORDS.slice(0, 30).join(', '), canonicalUrl, lang, extraHead)}
</head>
<body>
  <canvas id="matrix-bg"></canvas>
  <div class="scroll-progress" id="scrollProgress"></div>
  ${getHeaderHTML(lang, 'listing')}
  <main id="main-content">
    <section class="section" id="projects">
      <div class="container">
        <div class="section__header">
          <h1 class="section__title">${tag ? t.tagTitle + ' <span class="hero__highlight">#' + escapeHTML(tag) + '</span>' : t.feedTitle}</h1>
          <p class="section__desc">${pageCounter}</p>
        </div>
        <div class="posts-feed-wrapper">
          <div class="posts-feed" id="postsFeed">
            ${generatePostsHTML(pagePosts, lang)}
          </div>
        </div>
        ${generatePaginationHTML(pageNum, totalPages, lang, basePath)}
      </div>
    </section>
  </main>
  ${getFooterHTML(lang, posts)}
  ${getFloatingButtonsHTML()}
  ${getClientJS(lang)}
</body>
</html>`;
}

// ============================================================
// TAG FUNCTIONS
// ============================================================
function findPostsByTag(posts, tag) {
  if (!tag || !posts) return [];
  let decodedTag;
  try { decodedTag = decodeURIComponent(tag).toLowerCase(); } catch { decodedTag = tag.toLowerCase(); }
  decodedTag = decodedTag.replace(/^#+/, '');
  return posts.filter(post => {
    if (!post) return false;
    if (post.hashtags && post.hashtags.some(h => h.replace(/^#+/, '').toLowerCase() === decodedTag)) return true;
    const textToSearch = (post.textWithHashtags || post.text || '').toLowerCase();
    return textToSearch.includes('#' + decodedTag);
  });
}

function getPopularTags(posts, limit = CONFIG.POPULAR_TAGS_LIMIT) {
  const tagCounts = new Map();
  for (const post of posts) {
    if (!post || !post.hashtags) continue;
    for (const tag of post.hashtags) {
      const cleanTag = tag.replace(/^#+/, '').toLowerCase();
      tagCounts.set(cleanTag, (tagCounts.get(cleanTag) || 0) + 1);
    }
  }
  return Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([tag]) => tag);
}

function findRelatedPosts(currentPost, allPosts, limit = 7) {
  if (!currentPost || !allPosts) return [];
  const currentKeywords = new Set(currentPost.keywords || []);
  const searchPool = allPosts.slice(0, CONFIG.RELATED_POSTS_LIMIT);
  const candidates = [];
  for (const post of searchPool) {
    if (!post || post.id === currentPost.id) continue;
    let score = 0;
    for (const kw of (post.keywords || [])) { if (currentKeywords.has(kw)) score++; }
    if (score > 0) candidates.push({ post, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const scored = candidates.slice(0, limit).map(item => item.post);
  if (scored.length < limit) {
    const scoredIds = new Set(scored.map(p => p.id));
    for (const post of searchPool) {
      if (post && post.id !== currentPost.id && !scoredIds.has(post.id) && scored.length < limit) scored.push(post);
    }
  }
  return scored;
}

// ============================================================
// SCHEMA GENERATORS
// ============================================================
const STATIC_ORG_SCHEMA = JSON.stringify({
  "@context": "https://schema.org", "@type": "LocalBusiness",
  "name": CONFIG.SITE_AUTHOR, "url": CONFIG.SITE_URL, "logo": CONFIG.LOGO_URL, "image": CONFIG.LOGO_URL,
  "telephone": CONFIG.PHONE,
  "address": { "@type": "PostalAddress", "streetAddress": CONFIG.ADDRESS_STREET, "addressLocality": CONFIG.ADDRESS_CITY, "addressRegion": CONFIG.ADDRESS_REGION, "postalCode": CONFIG.ADDRESS_POSTAL, "addressCountry": "RU" },
  "geo": { "@type": "GeoCoordinates", "latitude": CONFIG.LATITUDE, "longitude": CONFIG.LONGITUDE },
  "openingHoursSpecification": { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"], "opens": "09:00", "closes": "19:00" },
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.8", "reviewCount": "127" },
  "priceRange": "\u20BD\u20BD", "currenciesAccepted": "RUB",
  "sameAs": [CONFIG.TELEGRAM_WEB, CONFIG.INSTAGRAM, CONFIG.VK, CONFIG.WHATSAPP]
});

function generateWebSiteSchema(lang) {
  return JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", "name": lang === 'ru' ? 'АбаканМебель' : 'AbakanMebel', "url": CONFIG.SITE_URL, "potentialAction": { "@type": "SearchAction", "target": CONFIG.SITE_URL + '/?q={search_term_string}', "query-input": "required name=search_term_string" } });
}

function generateFAQSchema(lang) {
  const faqs = LANGUAGES[lang].faqItems;
  return JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faqs.map(f => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } })) });
}

function generateItemListSchema(posts, lang) {
  return JSON.stringify({ "@context": "https://schema.org", "@type": "ItemList", "name": lang === 'ru' ? 'Портфолио проектов АбаканМебель' : 'AbakanMebel Project Portfolio', "numberOfItems": posts.length, "itemListElement": posts.slice(0, 10).map((p, i) => ({ "@type": "ListItem", "position": i + 1, "url": lang === 'ru' ? p.postUrl : p.postUrlEn, "name": p.title })) });
}

function generateBreadcrumbSchema(items) {
  return JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items.map((item, i) => ({ "@type": "ListItem", "position": i + 1, "name": item.name, "item": item.url })) });
}

function generateNewsArticleSchema(post, lang) {
  const posterUrl = post.hasMedia && post.media[0] && post.media[0].type === 'photo' ? post.media[0].directUrl : CONFIG.LOGO_URL;
  return JSON.stringify({ "@context": "https://schema.org", "@type": "Article", "headline": post.title, "url": lang === 'ru' ? post.postUrl : post.postUrlEn, "datePublished": new Date(post.date).toISOString(), "dateModified": new Date(post.date).toISOString(), "description": generateSmartDescription(post.text, lang), "inLanguage": lang === 'ru' ? 'ru-RU' : 'en-US', "publisher": { "@type": "Organization", "name": CONFIG.SITE_AUTHOR, "url": CONFIG.SITE_URL, "logo": { "@type": "ImageObject", "url": CONFIG.LOGO_URL } }, "author": { "@type": "Organization", "name": CONFIG.SITE_AUTHOR }, "image": { "@type": "ImageObject", "url": posterUrl } });
}

function generateExtraSEOMeta(ogImage, lang) {
  return `<meta name="thumbnail" content="${escapeHTML(ogImage)}">
  <meta name="twitter:image" content="${escapeHTML(ogImage)}">
  <meta name="format-detection" content="telephone=yes">
  <meta name="revisit-after" content="1 days">
  <meta name="geo.region" content="RU-KK">
  <meta name="geo.placename" content="Абакан">
  <meta name="ICBM" content="53.7156, 91.4289">
  <meta property="og:locale:alternate" content="${lang === 'ru' ? 'en_US' : 'ru_RU'}">
  <link rel="dns-prefetch" href="https://i.pinimg.com">
  <link rel="dns-prefetch" href="https://raw.githubusercontent.com">`;
}

// ============================================================
// PAGE GENERATORS
// ============================================================
function generateHomePage(posts, lang) {
  const t = LANGUAGES[lang];
  const langPrefix = lang === 'en' ? '/en' : '';
  const totalPages = Math.ceil(posts.length / CONFIG.POSTS_PER_PAGE);
  const initialPosts = posts.slice(0, CONFIG.POSTS_PER_PAGE);
  const seoTitle = lang === 'ru'
    ? 'АбаканМебель — Кухни и шкафы-купе на заказ в Абакане | 25 лет опыта'
    : 'AbakanMebel — Custom Kitchens & Wardrobes in Abakan | 25 Years Experience';
  const seoDesc = lang === 'ru'
    ? `Мебель на заказ в Абакане и Хакасии. Кухни, шкафы-купе, гарантия 3 года. Более ${posts.length} проектов. Бесплатный замер, 3D проект.`
    : `Custom furniture in Abakan and Khakassia. Kitchens, wardrobes, 3-year warranty. Over ${posts.length} projects. Free measurement, 3D design.`;
  const canonicalUrl = lang === 'ru' ? CONFIG.SITE_URL : CONFIG.SITE_URL + '/en/';
  const ogUrl = canonicalUrl;
  const ogImage = CONFIG.LOGO_URL;
  const pageCounter = totalPages > 1
    ? t.pageXofY.replace('{X}', '1').replace('{Y}', totalPages) + ' (' + posts.length + (lang === 'ru' ? ' проектов)' : ' projects)')
    : (lang === 'ru' ? 'Всего ' + posts.length : 'Total ' + posts.length);

  let relNext = '';
  if (totalPages > 1) {
    const nextCanonical = lang === 'ru' ? `${CONFIG.SITE_URL}/page/2/` : `${CONFIG.SITE_URL}/en/page/2/`;
    relNext = `<link rel="next" href="${nextCanonical}">`;
  }

  const extraHead = `<link rel="amphtml" href="${CONFIG.SITE_URL}${langPrefix}/amp/">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${ogUrl}">
  <meta property="og:title" content="${escapeHTML(seoTitle)}">
  <meta property="og:description" content="${escapeHTML(seoDesc)}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:site_name" content="${t.companyName}">
  <meta property="og:locale" content="${lang === 'ru' ? 'ru_RU' : 'en_US'}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHTML(seoTitle)}">
  <meta name="twitter:description" content="${escapeHTML(seoDesc)}">
  ${generateExtraSEOMeta(ogImage, lang)}
  ${relNext}
  <script type="application/ld+json">${STATIC_ORG_SCHEMA}</script>
  <script type="application/ld+json">${generateWebSiteSchema(lang)}</script>
  <script type="application/ld+json">${generateFAQSchema(lang)}</script>
  <script type="application/ld+json">${generateItemListSchema(posts, lang)}</script>`;

  return `<!DOCTYPE html>
<html lang="${lang}" data-theme="${CONFIG.DEFAULT_THEME}">
<head>
  ${getCommonHeadHTML(seoTitle, seoDesc, CONFIG.NEWS_KEYWORDS.slice(0, 50).join(', '), canonicalUrl, lang, extraHead)}
</head>
<body>
  <canvas id="matrix-bg"></canvas>
  <div class="scroll-progress" id="scrollProgress"></div>
  ${getHeaderHTML(lang, 'home')}
  <main id="main-content">
    <section class="hero">
      <div class="container hero__container">
        <div class="hero__content">
          <h1 class="hero__title">${t.heroTitle}<span class="hero__highlight">${t.heroHighlight}</span></h1>
          <p class="hero__desc">${t.heroSubtitle}</p>
          <div class="hero__features">
            ${t.heroFeatures.map(f => `<div class="hero__feature">&check; ${f}</div>`).join('')}
          </div>
          <div class="hero__actions">
            <a href="${CONFIG.TELEGRAM_PHONE}" class="btn btn--primary" target="_blank" rel="noopener">${t.heroCTA}</a>
            <a href="${CONFIG.PHONE_LINK}" class="btn btn--primary">&#128222; ${t.heroCall}</a>
          </div>
        </div>
        <div class="hero__stats">
          <div class="stat-card"><div class="stat-card__num">25+</div><div class="stat-card__label">${t.statsYears}</div></div>
          <div class="stat-card"><div class="stat-card__num">&#127873;</div><div class="stat-card__label">${t.statsGift}</div></div>
          <div class="stat-card"><div class="stat-card__num">3</div><div class="stat-card__label">${t.statsWarranty}</div></div>
          <div class="stat-card"><div class="stat-card__num">&#128211;</div><div class="stat-card__label">${t.statsFreeMeasure}</div></div>
        </div>
      </div>
    </section>
    <section class="section" id="services">
      <div class="container">
        <div class="section__header">
          <h2 class="section__title">${t.servicesTitle}</h2>
          <p class="section__desc">${t.servicesSubtitle}</p>
        </div>
        <div class="services__grid">
          ${t.services.map(s => `<div class="service-card">
            <div class="service-card__icon">${SERVICE_ICONS[s.icon]}</div>
            <h3 class="service-card__title">${s.title}</h3>
            <p class="service-card__desc">${s.desc}</p>
            <span class="service-card__price">${s.price}</span>
          </div>`).join('')}
        </div>
      </div>
    </section>
    <section class="section" id="projects">
      <div class="container">
        <div class="section__header">
          <h2 class="section__title">${t.feedTitle}</h2>
          <p class="section__desc">${pageCounter}</p>
        </div>
        <div class="posts-feed-wrapper">
          <div class="posts-feed" id="postsFeed">
            ${generatePostsHTML(initialPosts, lang)}
          </div>
        </div>
        ${generatePaginationHTML(1, totalPages, lang, '/')}
      </div>
    </section>
    <section class="section" id="about">
      <div class="container">
        <div class="section__header"><h2 class="section__title">${t.aboutTitle}</h2></div>
        <div class="features__grid">
          ${Object.entries(t.aboutFeatures).map(([key, feature]) => `<div class="feature-card">
            <div class="feature-card__icon">${FEATURE_ICONS[feature.icon]}</div>
            <h3 class="feature-card__title">${feature.title}</h3>
            <p class="feature-card__desc">${feature.desc}</p>
          </div>`).join('')}
        </div>
      </div>
    </section>
    <section class="section" id="faq">
      <div class="container">
        <div class="section__header"><h2 class="section__title">${t.faqTitle}</h2></div>
        <div class="faq__list">
          ${t.faqItems.map(item => `<details class="faq__item">
            <summary class="faq__question"><span>${item.q}</span><span>+</span></summary>
            <div class="faq__answer">${item.a}</div>
          </details>`).join('')}
        </div>
      </div>
    </section>
    <section class="contact" id="contact">
      <div class="container contact__container">
        <h2 class="contact__title">${t.contactTitle}</h2>
        <p class="contact__desc">${t.contactSubtitle}</p>
        <div class="contact__buttons">
          <a href="${CONFIG.TELEGRAM_PHONE}" class="btn btn--telegram" target="_blank" rel="noopener">${TELEGRAM_LOGO_SVG} Telegram</a>
          <a href="${CONFIG.WHATSAPP}" class="btn btn--whatsapp" target="_blank" rel="noopener">${WHATSAPP_LOGO_SVG} WhatsApp</a>
          <a href="${CONFIG.PHONE_LINK}" class="btn btn--primary">${PHONE_LOGO_SVG} ${CONFIG.PHONE}</a>
        </div>
        <div class="contact__info">
          <p>&#128205; ${CONFIG.ADDRESS}</p>
          <p>&#128336; ${CONFIG.WORKING_HOURS.days[lang]}: ${CONFIG.WORKING_HOURS.time}</p>
        </div>
      </div>
    </section>
  </main>
  ${getFooterHTML(lang, posts)}
  ${getFloatingButtonsHTML()}
  ${getClientJS(lang)}
</body>
</html>`;
}

function generatePostPage(post, posts, lang) {
  const t = LANGUAGES[lang];
  const langPrefix = lang === 'en' ? '/en' : '';
  const homeUrl = CONFIG.SITE_URL + langPrefix + '/';
  const postUrl = lang === 'ru' ? post.postUrl : post.postUrlEn;
  const ampUrl = lang === 'ru' ? post.ampUrl : post.ampUrlEn;
  const relatedPosts = findRelatedPosts(post, posts, 7);
  const galleryBlock = generateGalleryHTML(post, lang);
  const seoTitle = post.title + ' | ' + t.companyName;
  const seoDesc = generateSmartDescription(post.text, lang);
  const ogImage = post.hasMedia && post.media[0] && post.media[0].type === 'photo' ? post.media[0].directUrl : CONFIG.LOGO_URL;

  const extraHead = `<link rel="amphtml" href="${ampUrl}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${postUrl}">
  <meta property="og:title" content="${escapeHTML(seoTitle)}">
  <meta property="og:description" content="${escapeHTML(seoDesc)}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:site_name" content="${t.companyName}">
  <meta property="og:locale" content="${lang === 'ru' ? 'ru_RU' : 'en_US'}">
  <meta property="article:published_time" content="${new Date(post.date).toISOString()}">
  <meta property="article:section" content="${CONFIG.GOOGLE_NEWS_CATEGORY}">
  ${post.hashtags && post.hashtags.length > 0 ? post.hashtags.slice(0, 10).map(tag => `<meta property="article:tag" content="${escapeHTML(tag)}">`).join('\n  ') : ''}
  <meta name="twitter:card" content="summary_large_image">
  ${generateExtraSEOMeta(ogImage, lang)}
  <script type="application/ld+json">${STATIC_ORG_SCHEMA}</script>
  <script type="application/ld+json">${generateBreadcrumbSchema([{ name: t.companyName, url: homeUrl }, { name: post.title.substring(0, 50), url: postUrl }])}</script>
  <script type="application/ld+json">${generateNewsArticleSchema(post, lang)}</script>`;

  return `<!DOCTYPE html>
<html lang="${lang}" data-theme="${CONFIG.DEFAULT_THEME}">
<head>
  ${getCommonHeadHTML(seoTitle, seoDesc, (post.keywords || []).concat(CONFIG.NEWS_KEYWORDS.slice(0, 30)).slice(0, 25).join(', '), postUrl, lang, extraHead)}
</head>
<body>
  <canvas id="matrix-bg"></canvas>
  <div class="scroll-progress" id="scrollProgress"></div>
  ${getHeaderHTML(lang, 'post')}
  <main class="post-page" id="main-content">
    <div class="container">
      <nav class="breadcrumbs">
        <ol class="breadcrumbs__list">
          <li class="breadcrumbs__item"><a href="${homeUrl}">${lang === 'ru' ? 'Главная' : 'Home'}</a></li>
          <li class="breadcrumbs__item"><a href="${homeUrl}#projects">${t.navProjects}</a></li>
          <li class="breadcrumbs__item">${escapeHTML(post.title.substring(0, 50))}...</li>
        </ol>
      </nav>
      <article class="post">
        <header class="post__header">
          <time class="post__date">&#128197; ${new Date(post.date).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
          <h1 class="post__title">${escapeHTML(post.title)}</h1>
        </header>
        ${galleryBlock}
        <div class="post__content">
          <div class="post__text">${formatPostText(post.textWithHashtags || post.text, lang)}</div>
        </div>
        ${post.hashtags && post.hashtags.length > 0 ? `<div class="post__tags">
          ${post.hashtags.map(tag => `<a href="${homeUrl}tag/${encodeURIComponent(tag.replace(/^#+/, ''))}" class="tag">#${escapeHTML(tag)}</a>`).join('')}
        </div>` : ''}
        <div class="post-actions">
          <a href="${homeUrl}" class="btn btn-home">&#127968; ${t.postHomeBtn}</a>
          <a href="${post.telegramLink}" target="_blank" rel="noopener" class="btn btn-telegram">${TELEGRAM_LOGO_SVG} ${t.postTelegramBtn}</a>
        </div>
      </article>
      ${relatedPosts.length > 0 ? `<section class="related-posts">
        <h3 class="related-posts__title">${t.relatedPostsTitle}</h3>
        <p class="related-posts__subtitle">${t.relatedPostsSubtitle}</p>
        <div class="related-posts__grid">
          ${relatedPosts.map(rp => {
            const photo = rp.media && rp.media.find(m => m.type === 'photo');
            const rpUrl = lang === 'ru' ? rp.postUrl : rp.postUrlEn;
            return `<a href="${rpUrl}" class="related-post-card"><div class="related-post-card__media">
              ${photo ? `<img src="${getProxyMediaUrl(photo.directUrl)}" alt="${escapeHTML(rp.title)}" loading="lazy">` : ''}
              </div><div class="related-post-card__content"><div class="related-post-card__title">${escapeHTML(rp.title.substring(0, 60))}...</div></div></a>`;
          }).join('')}
        </div>
      </section>` : ''}
      <div class="post-cta">
        <h3 class="post-cta__title">${lang === 'ru' ? 'Хотите похожий проект?' : 'Want a Similar Project?'}</h3>
        <p class="post-cta__desc">${lang === 'ru' ? 'Свяжитесь с нами для бесплатного замера и расчёта стоимости' : 'Contact us for free measurement and cost calculation'}</p>
        <div class="post-cta__buttons">
          <a href="${CONFIG.TELEGRAM_PHONE}" target="_blank" rel="noopener" class="btn btn--telegram">${TELEGRAM_LOGO_SVG} Telegram</a>
          <a href="${CONFIG.PHONE_LINK}" class="btn btn--primary">${PHONE_LOGO_SVG} ${CONFIG.PHONE}</a>
        </div>
      </div>
    </div>
  </main>
  ${getFooterHTML(lang, posts)}
  ${getFloatingButtonsHTML()}
  ${getClientJS(lang)}
</body>
</html>`;
}

function generateTagPage(tag, tagPosts, allPosts, lang) {
  const t = LANGUAGES[lang];
  const langPrefix = lang === 'en' ? '/en' : '';
  const homeUrl = CONFIG.SITE_URL + langPrefix + '/';
  const totalPages = Math.ceil(tagPosts.length / CONFIG.POSTS_PER_PAGE);
  const initialPosts = tagPosts.slice(0, CONFIG.POSTS_PER_PAGE);
  const pageCounter = totalPages > 1
    ? t.pageXofY.replace('{X}', '1').replace('{Y}', totalPages) + ' (' + tagPosts.length + (lang === 'ru' ? ' проектов)' : ' projects)')
    : t.tagPostsFound + ': ' + tagPosts.length;
  const seoTitle = `#${tag} — ${lang === 'ru' ? 'Мебель и проекты' : 'Furniture Projects'} | ${t.companyName}`;
  const seoDesc = lang === 'ru'
    ? `Все проекты по тегу #${tag}. Найдено ${tagPosts.length} работ. Кухни, шкафы-купе и мебель на заказ в Абакане.`
    : `All projects tagged #${tag}. Found ${tagPosts.length} works. Custom kitchens, wardrobes and furniture in Abakan.`;
  const canonicalUrl = lang === 'ru' ? `${CONFIG.SITE_URL}/tag/${encodeURIComponent(tag)}` : `${CONFIG.SITE_URL}/en/tag/${encodeURIComponent(tag)}`;
  const basePath = `/tag/${encodeURIComponent(tag)}/`;

  let relNext = '';
  if (totalPages > 1) {
    const nextCanonical = lang === 'ru' ? `${CONFIG.SITE_URL}/tag/${encodeURIComponent(tag)}/page/2/` : `${CONFIG.SITE_URL}/en/tag/${encodeURIComponent(tag)}/page/2/`;
    relNext = `<link rel="next" href="${nextCanonical}">`;
  }

  return `<!DOCTYPE html>
<html lang="${lang}" data-theme="${CONFIG.DEFAULT_THEME}">
<head>
  ${getCommonHeadHTML(seoTitle, seoDesc, `${tag}, #${tag}, мебель Абакан`, canonicalUrl, lang, `
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${escapeHTML(seoTitle)}">
  <meta property="og:description" content="${escapeHTML(seoDesc)}">
  <meta property="og:image" content="${CONFIG.LOGO_URL}">
  <meta property="og:site_name" content="${t.companyName}">
  <meta name="twitter:card" content="summary_large_image">
  ${generateExtraSEOMeta(CONFIG.LOGO_URL, lang)}
  ${relNext}
  <script type="application/ld+json">${STATIC_ORG_SCHEMA}</script>
  <script type="application/ld+json">${generateWebSiteSchema(lang)}</script>
  <script type="application/ld+json">${generateBreadcrumbSchema([{ name: t.companyName, url: homeUrl }, { name: '#' + tag, url: canonicalUrl }])}</script>
  <script type="application/ld+json">${generateItemListSchema(tagPosts, lang)}</script>`)}
</head>
<body>
  <canvas id="matrix-bg"></canvas>
  <div class="scroll-progress" id="scrollProgress"></div>
  ${getHeaderHTML(lang, 'tag')}
  <main id="main-content">
    <section class="hero">
      <div class="container hero__container" style="grid-template-columns: 1fr; text-align: center;">
        <div class="hero__content" style="max-width: 800px; margin: 0 auto;">
          <h1 class="hero__title">${t.tagTitle} <span class="hero__highlight">#${escapeHTML(tag)}</span></h1>
          <p class="hero__desc">${pageCounter}</p>
          <div class="hero__actions" style="justify-content: center;">
            <a href="${homeUrl}" class="btn btn--primary">${t.navHome}</a>
          </div>
        </div>
      </div>
    </section>
    <section class="section" id="projects">
      <div class="container">
        <div class="posts-feed-wrapper">
          <div class="posts-feed" id="postsFeed">${generatePostsHTML(initialPosts, lang)}</div>
        </div>
        ${generatePaginationHTML(1, totalPages, lang, basePath)}
      </div>
    </section>
  </main>
  ${getFooterHTML(lang, allPosts)}
  ${getFloatingButtonsHTML()}
  ${getClientJS(lang)}
</body>
</html>`;
}

// ============================================================
// SITEMAP, RSS, ROBOTS, MANIFEST
// ============================================================
function generateSitemap(posts) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';
  // Home pages
  xml += `<url><loc>${CONFIG.SITE_URL}</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod><changefreq>daily</changefreq><priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="ru" href="${CONFIG.SITE_URL}"/><xhtml:link rel="alternate" hreflang="en" href="${CONFIG.SITE_URL}/en/"/><xhtml:link rel="alternate" hreflang="x-default" href="${CONFIG.SITE_URL}"/></url>\n`;
  xml += `<url><loc>${CONFIG.SITE_URL}/en/</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod><changefreq>daily</changefreq><priority>0.9</priority>
    <xhtml:link rel="alternate" hreflang="ru" href="${CONFIG.SITE_URL}"/><xhtml:link rel="alternate" hreflang="en" href="${CONFIG.SITE_URL}/en/"/></url>\n`;
  // Post pages
  for (const post of posts.slice(0, CONFIG.MAX_POSTS_SITEMAP)) {
    const dateStr = new Date(post.date).toISOString().split('T')[0];
    const photo = post.media && post.media.find(m => m.type === 'photo');
    xml += `<url><loc>${post.postUrl}</loc><lastmod>${dateStr}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority>
      <xhtml:link rel="alternate" hreflang="ru" href="${post.postUrl}"/><xhtml:link rel="alternate" hreflang="en" href="${post.postUrlEn}"/>
      ${photo ? `<image:image><image:loc>${photo.directUrl}</image:loc><image:title>${escapeHTML(post.title)}</image:title></image:image>` : ''}</url>\n`;
    xml += `<url><loc>${post.postUrlEn}</loc><lastmod>${dateStr}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority>
      <xhtml:link rel="alternate" hreflang="ru" href="${post.postUrl}"/><xhtml:link rel="alternate" hreflang="en" href="${post.postUrlEn}"/></url>\n`;
  }
  // Main feed pagination pages
  const mainTotalPages = Math.ceil(posts.length / CONFIG.POSTS_PER_PAGE);
  for (let n = 2; n <= mainTotalPages; n++) {
    xml += `<url><loc>${CONFIG.SITE_URL}/page/${n}/</loc><changefreq>daily</changefreq><priority>0.8</priority>
      <xhtml:link rel="alternate" hreflang="ru" href="${CONFIG.SITE_URL}/page/${n}/"/><xhtml:link rel="alternate" hreflang="en" href="${CONFIG.SITE_URL}/en/page/${n}/"/></url>\n`;
    xml += `<url><loc>${CONFIG.SITE_URL}/en/page/${n}/</loc><changefreq>daily</changefreq><priority>0.7</priority>
      <xhtml:link rel="alternate" hreflang="ru" href="${CONFIG.SITE_URL}/page/${n}/"/><xhtml:link rel="alternate" hreflang="en" href="${CONFIG.SITE_URL}/en/page/${n}/"/></url>\n`;
  }
  // Tag pages
  const tags = getPopularTags(posts, 20);
  for (const tag of tags) {
    xml += `<url><loc>${CONFIG.SITE_URL}/tag/${encodeURIComponent(tag)}</loc><changefreq>weekly</changefreq><priority>0.6</priority>
      <xhtml:link rel="alternate" hreflang="ru" href="${CONFIG.SITE_URL}/tag/${encodeURIComponent(tag)}"/><xhtml:link rel="alternate" hreflang="en" href="${CONFIG.SITE_URL}/en/tag/${encodeURIComponent(tag)}"/></url>\n`;
    // Tag pagination pages
    const tagPosts = findPostsByTag(posts, tag);
    const tagTotalPages = Math.ceil(tagPosts.length / CONFIG.POSTS_PER_PAGE);
    for (let n = 2; n <= tagTotalPages; n++) {
      xml += `<url><loc>${CONFIG.SITE_URL}/tag/${encodeURIComponent(tag)}/page/${n}/</loc><changefreq>weekly</changefreq><priority>0.5</priority>
        <xhtml:link rel="alternate" hreflang="ru" href="${CONFIG.SITE_URL}/tag/${encodeURIComponent(tag)}/page/${n}/"/><xhtml:link rel="alternate" hreflang="en" href="${CONFIG.SITE_URL}/en/tag/${encodeURIComponent(tag)}/page/${n}/"/></url>\n`;
      xml += `<url><loc>${CONFIG.SITE_URL}/en/tag/${encodeURIComponent(tag)}/page/${n}/</loc><changefreq>weekly</changefreq><priority>0.4</priority>
        <xhtml:link rel="alternate" hreflang="ru" href="${CONFIG.SITE_URL}/tag/${encodeURIComponent(tag)}/page/${n}/"/><xhtml:link rel="alternate" hreflang="en" href="${CONFIG.SITE_URL}/en/tag/${encodeURIComponent(tag)}/page/${n}/"/></url>\n`;
    }
  }
  xml += '</urlset>';
  return xml;
}

function generateRSSFeed(posts, lang) {
  const t = LANGUAGES[lang];
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n';
  xml += `<title>${t.companyName}</title><link>${CONFIG.SITE_URL}</link><description>${lang === 'ru' ? 'Мебель на заказ в Абакане' : 'Custom furniture in Abakan'}</description>
  <language>${lang === 'ru' ? 'ru-ru' : 'en-us'}</language><atom:link href="${CONFIG.SITE_URL}${lang === 'en' ? '/en' : ''}/rss.xml" rel="self" type="application/rss+xml"/>\n`;
  for (const post of posts.slice(0, CONFIG.MAX_POSTS_RSS)) {
    const postUrl = lang === 'ru' ? post.postUrl : post.postUrlEn;
    const desc = generateSmartDescription(post.text, lang);
    xml += `<item><title>${escapeHTML(post.title)}</title><link>${postUrl}</link><description>${escapeHTML(desc)}</description>
    <pubDate>${new Date(post.date).toUTCString()}</pubDate><guid isPermaLink="true">${postUrl}</guid></item>\n`;
  }
  xml += '</channel>\n</rss>';
  return xml;
}

function generateRobotsTxt() {
  return `User-agent: *
Allow: /
Crawl-delay: 1
Sitemap: ${CONFIG.SITE_URL}/sitemap.xml

User-agent: Googlebot
Allow: /
Crawl-delay: 0

User-agent: YandexBot
Allow: /
Crawl-delay: 1`;
}

function generateManifest() {
  return JSON.stringify({
    name: CONFIG.SITE_NAME, short_name: CONFIG.SITE_NAME, description: 'Мебель на заказ в Абакане',
    start_url: '/', display: 'standalone', theme_color: '#6366f1', background_color: '#0f172a',
    icons: [{ src: CONFIG.LOGO_URL, sizes: '640x640', type: 'image/jpeg' }]
  }, null, 2);
}

// ============================================================
// MAIN BUILD
// ============================================================
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

async function build() {
  console.log('=== ABAKANMEBEL Static Site Generator ===\n');

  // 1. Load data
  console.log('Loading data...');
  const rawPosts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'cached_posts.json'), 'utf8'));
  console.log(`  Raw posts: ${rawPosts.length}`);

  // 2. Transform posts
  console.log('Transforming posts...');
  let posts = rawPosts.map((post, index) => transformGitHubPost(post, index));
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (posts.length > CONFIG.MAX_POSTS) posts = posts.slice(0, CONFIG.MAX_POSTS);
  console.log(`  Transformed: ${posts.length}`);

  // 3. Generate posts data JSON for client-side use
  console.log('Generating posts data JSON...');
  const postsJsonData = posts.map(p => ({
    id: p.id, date: p.date, text: p.text, textWithHashtags: p.textWithHashtags, title: p.title,
    media: p.media, hasMedia: p.hasMedia, mediaCount: p.mediaCount, hashtags: p.hashtags,
    keywords: p.keywords, telegramLink: p.telegramLink, postUrl: p.postUrl, postUrlEn: p.postUrlEn,
    ampUrl: p.ampUrl, ampUrlEn: p.ampUrlEn
  }));
  writeFile(path.join(DOCS_DIR, 'data', 'posts.json'), JSON.stringify(postsJsonData));
  console.log('  data/posts.json saved');

  // 4. Generate home pages
  console.log('Generating home pages...');
  writeFile(path.join(DOCS_DIR, 'index.html'), generateHomePage(posts, 'ru'));
  writeFile(path.join(DOCS_DIR, 'en', 'index.html'), generateHomePage(posts, 'en'));
  console.log('  RU + EN home pages saved');

  // 4b. Generate main feed pagination pages
  const mainTotalPages = Math.ceil(posts.length / CONFIG.POSTS_PER_PAGE);
  if (mainTotalPages > 1) {
    console.log('Generating main feed pagination pages...');
    let paginationCount = 0;
    for (const lang of ['ru', 'en']) {
      for (let pageNum = 2; pageNum <= mainTotalPages; pageNum++) {
        const dir = lang === 'ru'
          ? path.join(DOCS_DIR, 'page', String(pageNum))
          : path.join(DOCS_DIR, 'en', 'page', String(pageNum));
        writeFile(path.join(dir, 'index.html'), generateListingPage(posts, lang, pageNum, mainTotalPages, posts.length, null));
        paginationCount++;
      }
    }
    console.log(`  ${paginationCount} main feed pagination pages saved`);
  }

  // 5. Generate post pages
  console.log('Generating post pages...');
  let postCount = 0;
  for (const post of posts) {
    writeFile(path.join(DOCS_DIR, 'post', post.id, 'index.html'), generatePostPage(post, posts, 'ru'));
    writeFile(path.join(DOCS_DIR, 'en', 'post', post.id, 'index.html'), generatePostPage(post, posts, 'en'));
    postCount++;
    if (postCount % 50 === 0) process.stdout.write(`  ${postCount}/${posts.length} posts...\n`);
  }
  console.log(`  ${posts.length * 2} post pages saved`);

  // 6. Generate tag pages
  console.log('Generating tag pages...');
  const allTags = new Map();
  for (const post of posts) {
    if (!post.hashtags) continue;
    for (const tag of post.hashtags) {
      const cleanTag = tag.replace(/^#+/, '').toLowerCase();
      if (!allTags.has(cleanTag)) allTags.set(cleanTag, []);
      allTags.get(cleanTag).push(post);
    }
  }
  let tagPaginationCount = 0;
  for (const [tag, tagPosts] of allTags) {
    writeFile(path.join(DOCS_DIR, 'tag', tag, 'index.html'), generateTagPage(tag, tagPosts, posts, 'ru'));
    writeFile(path.join(DOCS_DIR, 'en', 'tag', tag, 'index.html'), generateTagPage(tag, tagPosts, posts, 'en'));
    // Generate tag pagination pages
    if (tagPosts.length > CONFIG.POSTS_PER_PAGE) {
      const tagTotalPages = Math.ceil(tagPosts.length / CONFIG.POSTS_PER_PAGE);
      for (const lang of ['ru', 'en']) {
        for (let pageNum = 2; pageNum <= tagTotalPages; pageNum++) {
          const dir = lang === 'ru'
            ? path.join(DOCS_DIR, 'tag', tag, 'page', String(pageNum))
            : path.join(DOCS_DIR, 'en', 'tag', tag, 'page', String(pageNum));
          writeFile(path.join(dir, 'index.html'), generateListingPage(tagPosts, lang, pageNum, tagTotalPages, tagPosts.length, tag));
          tagPaginationCount++;
        }
      }
    }
  }
  console.log(`  ${allTags.size * 2} tag pages saved` + (tagPaginationCount > 0 ? ` + ${tagPaginationCount} tag pagination pages` : ''));

  // 7. Generate sitemap
  console.log('Generating sitemap...');
  writeFile(path.join(DOCS_DIR, 'sitemap.xml'), generateSitemap(posts));

  // 8. Generate RSS
  writeFile(path.join(DOCS_DIR, 'rss.xml'), generateRSSFeed(posts, 'ru'));
  writeFile(path.join(DOCS_DIR, 'en', 'rss.xml'), generateRSSFeed(posts, 'en'));
  console.log('  Sitemap + RSS saved');

  // 9. Generate robots.txt
  writeFile(path.join(DOCS_DIR, 'robots.txt'), generateRobotsTxt());

  // 10. Generate manifest.json
  writeFile(path.join(DOCS_DIR, 'manifest.json'), generateManifest());

  // 11. Generate 404 page
  const notFoundHTML = `<!DOCTYPE html><html lang="ru" data-theme="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 — АбаканМебель</title><link rel="stylesheet" href="/css/style.css"></head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center"><div><h1 style="font-size:4rem;font-weight:900">404</h1><p style="font-size:1.2rem;color:var(--text-secondary)">Страница не найдена</p><a href="/" class="btn btn--primary" style="margin-top:24px">На главную</a></div></body></html>`;
  writeFile(path.join(DOCS_DIR, '404.html'), notFoundHTML);

  // 12. Generate client-side JS
  console.log('Generating client-side JS...');
  const clientJS = `(function() {
  'use strict';
  var savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  var themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function() {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }
  window.addEventListener('scroll', function() {
    var header = document.getElementById('header');
    var scrollProgress = document.getElementById('scrollProgress');
    var scrollToTop = document.getElementById('scrollToTop');
    if (window.scrollY > 50) { if (header) header.classList.add('scrolled'); }
    else { if (header) header.classList.remove('scrolled'); }
    var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    var scrolled = (winScroll / height) * 100;
    if (scrollProgress) scrollProgress.style.width = scrolled + '%';
    if (scrollToTop) {
      if (window.scrollY > 500) scrollToTop.classList.add('visible');
      else scrollToTop.classList.remove('visible');
    }
  });
  var scrollToTopBtn = document.getElementById('scrollToTop');
  if (scrollToTopBtn) {
    scrollToTopBtn.addEventListener('click', function() { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
  // Video thumbnail click
  document.addEventListener('click', function(e) {
    var thumb = e.target.closest('.video-thumbnail');
    if (thumb) {
      var videoSrc = thumb.dataset.videoSrc;
      if (videoSrc) {
        var container = thumb.parentElement;
        container.innerHTML = '<video src="' + videoSrc + '" controls autoplay playsinline style="width:100%;max-height:600px"></video>';
      }
    }
  });

  window.initAbakanMebel = function(matrixKeywords) {
    var canvas = document.getElementById('matrix-bg');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var columns = Math.floor(canvas.width / 20);
    var drops = [];
    for (var i = 0; i < columns; i++) drops[i] = 1;
    function draw() {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (var i = 0; i < drops.length; i++) {
        var text = matrixKeywords[Math.floor(Math.random() * matrixKeywords.length)];
        var x = i * 20;
        var y = drops[i] * 20;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '12px monospace';
        ctx.fillText(text, x, y);
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }
    setInterval(draw, 120);
    window.addEventListener('resize', function() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = Math.floor(canvas.width / 20);
      drops = [];
      for (var i = 0; i < columns; i++) drops[i] = 1;
    });
  };

  function hashStr(str) {
    if (!str) return '0';
    var hash = 2166136261;
    for (var i = 0; i < str.length; i++) { hash ^= str.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
    return hash.toString(36);
  }
})();`;
  writeFile(path.join(DOCS_DIR, 'js', 'main.js'), clientJS);

  // Summary
  console.log('\n=== BUILD COMPLETE ===');
  console.log(`Posts: ${posts.length}`);
  console.log(`Tags: ${allTags.size}`);
  console.log(`Languages: ru, en`);
  console.log('Output: docs/');
  console.log('\nFiles generated:');
  console.log('  - index.html (RU home)');
  console.log('  - en/index.html (EN home)');
  console.log(`  - ${posts.length * 2} post pages`);
  console.log(`  - ${allTags.size * 2} tag pages`);
  console.log('  - sitemap.xml');
  console.log('  - rss.xml + en/rss.xml');
  console.log('  - robots.txt');
  console.log('  - manifest.json');
  console.log('  - 404.html');
  console.log('  - css/style.css');
  console.log('  - js/main.js');
  console.log('  - data/posts.json');
}

build().catch(err => { console.error('Build failed:', err); process.exit(1); });
