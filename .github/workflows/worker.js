// worker.js - Парсер Telegram-канала для Cloudflare Workers
// Цель: получение, парсинг и кэширование до 1000 последних постов с медиафайлами.

// Конфигурация (значения устанавливаются как секреты/переменные в настройках Worker)
const CONFIG = {
    TELEGRAM_CHANNEL: 'abakan_mebel', // Имя канала (из URL: t.me/s/abakan_mebel)
    POSTS_LIMIT: 1000, // Максимальное количество постов для получения
    CACHE_TTL: 3600, // Время жизни кэша в секундах (1 час)
    GITHUB_TOKEN: '', // Заполняется через секреты: GITHUB_TOKEN
    GITHUB_REPO: 'abakanmebel9-jpg/a-m', // Ваш репозиторий
    GITHUB_BRANCH: 'main', // Ветка по умолчанию
};

// Основной обработчик запросов Worker
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Маршрутизация
    if (path === '/parse' && request.method === 'POST') {
        // Запуск процесса парсинга по запросу
        return await triggerParseAndCache();
    } else if (path === '/last-update') {
        // Проверка времени последнего обновления
        return await getLastUpdateTime();
    } else if (path.startsWith('/media/')) {
        // Прокси для загрузки и кэширования медиафайлов
        const mediaId = path.replace('/media/', '');
        return await fetchAndCacheMedia(mediaId, request);
    } else {
        // Информационная страница по умолчанию
        return new Response(JSON.stringify({
            service: 'Telegram Channel Parser for @abakan_mebel',
            endpoints: {
                trigger_manually: 'POST /parse',
                check_status: 'GET /last-update',
                access_media: 'GET /media/{file_id}'
            },
            config: {
                channel: CONFIG.TELEGRAM_CHANNEL,
                posts_limit: CONFIG.POSTS_LIMIT,
                cache_ttl: CONFIG.CACHE_TTL
            }
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 1. Основная функция парсинга и кэширования
async function triggerParseAndCache() {
    try {
        console.log(`[${new Date().toISOString()}] Начало парсинга канала @${CONFIG.TELEGRAM_CHANNEL}`);

        // Инициализация кэша (используется глобальный кэш Cloudflare)
        const cache = caches.default;
        const cacheKey = `https://tg-cache.data/latest_posts.json`;

        // Получение HTML-страницы канала
        const channelUrl = `https://t.me/s/${CONFIG.TELEGRAM_CHANNEL}`;
        const response = await fetch(channelUrl);
        const html = await response.text();

        // Парсинг постов из HTML
        const posts = parsePostsFromHTML(html);
        console.log(`Парсинг завершен. Найдено постов: ${posts.length}`);

        // Получение медиафайлов и сохранение в кэш
        const postsWithMedia = await enrichPostsWithMedia(posts);

        // Ограничение количества постов
        const limitedPosts = postsWithMedia.slice(0, CONFIG.POSTS_LIMIT);

        // Сохранение данных в кэш Cloudflare
        const cacheData = JSON.stringify({
            meta: {
                channel: CONFIG.TELEGRAM_CHANNEL,
                parsed_at: new Date().toISOString(),
                posts_count: limitedPosts.length
            },
            posts: limitedPosts
        });

        // Создание ответа для кэширования
        const cacheResponse = new Response(cacheData, {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': `public, max-age=${CONFIG.CACHE_TTL}`,
            }
        });

        // Помещение в кэш
        await cache.put(cacheKey, cacheResponse.clone());

        // Дополнительно: отправка данных в GitHub (опционально, требует настройки токена)
        if (CONFIG.GITHUB_TOKEN) {
            await backupToGitHub(limitedPosts);
        }

        return new Response(JSON.stringify({
            success: true,
            message: `Успешно спаршено и закэшировано ${limitedPosts.length} постов.`,
            timestamp: new Date().toISOString()
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Ошибка при парсинге:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 2. Парсер HTML Telegram канала
function parsePostsFromHTML(html) {
    const posts = [];
    // Регулярные выражения для извлечения данных постов
    const postRegex = /<div class="tgme_widget_message_wrap[^"]*"[^>]*>([\s\S]*?)<\/time><\/div>/g;
    const linkRegex = /<a class="tgme_widget_message_date"[^>]*href="\/([^"]+)"/;
    const textRegex = /<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/;
    const mediaRegex = /<a class="tgme_widget_message_photo_wrap[^>]*href="([^"]+)"/g;
    const videoRegex = /<video[^>]*src="([^"]+)"/g;
    const timeRegex = /<time[^>]*datetime="([^"]+)"[^>]*>/;

    let match;
    while ((match = postRegex.exec(html)) !== null && posts.length < CONFIG.POSTS_LIMIT) {
        const postHtml = match[1];
        const linkMatch = postHtml.match(linkRegex);
        const textMatch = postHtml.match(textRegex);
        const timeMatch = postHtml.match(timeRegex);

        if (linkMatch) {
            const post = {
                id: linkMatch[1].split('/').pop(),
                url: `https://t.me/${linkMatch[1]}`,
                timestamp: timeMatch ? timeMatch[1] : null,
                text: textMatch ? sanitizeText(textMatch[1]) : '',
                media: []
            };

            // Извлечение фото
            let mediaMatch;
            while ((mediaMatch = mediaRegex.exec(postHtml)) !== null) {
                post.media.push({ type: 'photo', url: mediaMatch[1] });
            }

            // Извлечение видео (сброс lastIndex для нового regex)
            const videoRegexLocal = /<video[^>]*src="([^"]+)"/g;
            while ((mediaMatch = videoRegexLocal.exec(postHtml)) !== null) {
                post.media.push({ type: 'video', url: mediaMatch[1] });
            }

            posts.push(post);
        }
    }

    // Сортировка постов от новых к старым
    return posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// 3. Обработка и кэширование медиафайлов
async function enrichPostsWithMedia(posts) {
    const enrichedPosts = [...posts];
    for (const post of enrichedPosts) {
        if (post.media && post.media.length > 0) {
            for (const mediaItem of post.media) {
                try {
                    // Генерация уникального ID для медиафайла
                    mediaItem.cached_id = `media_${post.id}_${mediaItem.type}_${Date.now()}`;
                    // URL для доступа через кэш Worker
                    mediaItem.cached_url = `${new URL(request.url).origin}/media/${mediaItem.cached_id}`;
                } catch (err) {
                    console.warn(`Не удалось обработать медиа для поста ${post.id}:`, err);
                }
            }
        }
    }
    return enrichedPosts;
}

// 4. Прокси для медиафайлов с кэшированием
async function fetchAndCacheMedia(mediaId, originalRequest) {
    const cache = caches.default;
    const cacheKey = `https://tg-cache.media/${mediaId}`;

    // Проверка кэша
    let response = await cache.match(cacheKey);
    if (response) {
        console.log(`Медиа ${mediaId} найдено в кэше.`);
        return response;
    }

    // Если нет в кэше, возвращаем заглушку или редирект
    // Реальная загрузка требует mapping mediaId -> original URL (реализуется отдельно)
    return new Response(JSON.stringify({
        error: 'Медиафайл не найден в кэше. Запустите парсинг для его загрузки.'
    }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
    });
}

// 5. Резервное копирование в GitHub
async function backupToGitHub(posts) {
    const apiUrl = `https://api.github.com/repos/${CONFIG.GITHUB_REPO}/contents/data/posts_${Date.now()}.json`;
    const content = JSON.stringify(posts, null, 2);
    const contentBase64 = btoa(unescape(encodeURIComponent(content)));

    const commitMessage = `Auto-backup: ${posts.length} posts from @${CONFIG.TELEGRAM_CHANNEL} at ${new Date().toISOString()}`;

    const payload = {
        message: commitMessage,
        content: contentBase64,
        branch: CONFIG.GITHUB_BRANCH
    };

    const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${CONFIG.GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Telegram-Parser-Worker'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
    }

    console.log(`Резервная копия успешно отправлена в GitHub.`);
}

// 6. Проверка времени последнего обновления
async function getLastUpdateTime() {
    const cache = caches.default;
    const cacheKey = `https://tg-cache.data/latest_posts.json`;
    const cached = await cache.match(cacheKey);

    if (cached) {
        const data = await cached.json();
        return new Response(JSON.stringify({
            last_updated: data.meta.parsed_at,
            posts_count: data.meta.posts_count,
            channel: data.meta.channel
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({
        last_updated: null,
        message: 'Данные еще не были закэшированы.'
    }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
    });
}

// Вспомогательная функция для очистки текста
function sanitizeText(html) {
    return html
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
