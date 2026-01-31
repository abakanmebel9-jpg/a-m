// Cloudflare Worker для отображения Telegram постов
// Репозиторий: https://github.com/abakanmebel9-jpg/a-m

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Если корневой путь - показываем HTML
  if (url.pathname === '/') {
    return await showHomePage()
  }
  
  // Если API запрос - возвращаем JSON
  if (url.pathname === '/api/posts') {
    return await getPostsJSON()
  }
  
  // Если API статистики
  if (url.pathname === '/api/stats') {
    return await getStatsJSON()
  }
  
  // Для остальных путей - 404
  return new Response('Не найдено', { status: 404 })
}

// Получаем данные из GitHub
async function fetchData() {
  const GITHUB_RAW = 'https://raw.githubusercontent.com/abakanmebel9-jpg/a-m/main'
  
  try {
    // Используем кэш Cloudflare
    const cache = caches.default
    const cacheKey = new Request(`${GITHUB_RAW}/data/posts.json`)
    
    let response = await cache.match(cacheKey)
    
    if (!response) {
      response = await fetch(`${GITHUB_RAW}/data/posts.json`, {
        headers: { 'User-Agent': 'Cloudflare-Worker' }
      })
      
      if (response.ok) {
        // Клонируем для кэширования (5 минут)
        const responseClone = response.clone()
        const headers = new Headers(responseClone.headers)
        headers.set('Cache-Control', 'public, max-age=300')
        
        response = new Response(responseClone.body, {
          status: responseClone.status,
          statusText: responseClone.statusText,
          headers: headers
        })
        
        await cache.put(cacheKey, response.clone())
      }
    }
    
    return response.ok ? await response.json() : null
  } catch (error) {
    console.error('Ошибка загрузки данных:', error)
    return null
  }
}

// Показываем главную страницу
async function showHomePage() {
  const data = await fetchData()
  
  if (!data) {
    return renderError('Данные временно недоступны. Попробуйте обновить через минуту.')
  }
  
  const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Abakan Mebel - Telegram</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f8f9fa;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e9ecef;
        }
        h1 {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        .status {
            background: #e8f4ff;
            border: 1px solid #cfe2ff;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 25px;
        }
        .post {
            background: white;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            border-left: 4px solid #3498db;
        }
        .post-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            color: #7f8c8d;
            font-size: 0.9em;
        }
        .post-text {
            margin-bottom: 10px;
            white-space: pre-wrap;
        }
        footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #95a5a6;
            font-size: 0.9em;
        }
        .update-btn {
            background: #3498db;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 10px;
        }
        .update-btn:hover {
            background: #2980b9;
        }
    </style>
</head>
<body>
    <header>
        <h1>📢 Abakan Mebel - Telegram</h1>
        <p>Автоматическое обновление каждые 5 минут</p>
    </header>
    
    <div class="status">
        <strong>Статус:</strong><br>
        • Постов: <strong>${data.post_count}</strong><br>
        • Обновлено: <strong>${new Date(data.updated_at).toLocaleString('ru-RU')}</strong><br>
        • Канал: <strong>${data.channel}</strong><br>
        <button class="update-btn" onclick="location.reload()">🔄 Обновить</button>
    </div>
    
    <div id="posts">
        ${data.posts.map(post => `
            <div class="post">
                <div class="post-header">
                    <span>📅 ${new Date(post.date).toLocaleString('ru-RU')}</span>
                    <span>#${post.id}</span>
                </div>
                <div class="post-text">${post.text.replace(/\n/g, '<br>')}</div>
                <div style="color: #95a5a6; font-size: 0.9em;">
                    Источник: ${post.source || 'telegram'}
                </div>
            </div>
        `).join('')}
    </div>
    
    <footer>
        <p>Powered by GitHub Actions + Cloudflare Worker</p>
        <p>
            <a href="/api/posts">JSON API</a> • 
            <a href="https://t.me/s/abakan_mebel">Оригинальный канал</a> • 
            <a href="https://github.com/abakanmebel9-jpg/a-m">Исходный код</a>
        </p>
    </footer>
    
    <script>
        // Автообновление каждые 60 секунд
        setTimeout(() => {
            if (!document.hidden) {
                location.reload()
            }
        }, 60000)
    </script>
</body>
</html>
  `
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60'
    }
  })
}

// Возвращаем JSON с постами
async function getPostsJSON() {
  const data = await fetchData()
  
  if (!data) {
    return new Response(JSON.stringify({ error: 'Данные недоступны' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

// Возвращаем статистику
async function getStatsJSON() {
  const GITHUB_RAW = 'https://raw.githubusercontent.com/abakanmebel9-jpg/a-m/main'
  
  try {
    const response = await fetch(`${GITHUB_RAW}/data/stats.json`)
    
    if (response.ok) {
      const stats = await response.json()
      return new Response(JSON.stringify(stats, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
  } catch (error) {
    console.error('Ошибка загрузки статистики:', error)
  }
  
  return new Response(JSON.stringify({ error: 'Статистика недоступна' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  })
}

// Рендер ошибки
function renderError(message) {
  const html = `
<!DOCTYPE html>
<html>
<head><title>Ошибка</title></head>
<body style="font-family: Arial; padding: 20px;">
    <h1>😕 Временная проблема</h1>
    <p>${message}</p>
    <p>Попробуйте:</p>
    <ul>
        <li>Обновить страницу через 1-2 минуты</li>
        <li>Проверить <a href="https://github.com/abakanmebel9-jpg/a-m/actions">GitHub Actions</a></li>
        <li>Перейти в <a href="https://t.me/s/abakan_mebel">Telegram канал</a></li>
    </ul>
</body>
</html>
  `
  
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}
