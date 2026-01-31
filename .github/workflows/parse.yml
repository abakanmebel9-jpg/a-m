import json
import os
import re
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
import requests

CHANNEL_URL = "https://t.me/s/abakan_mebel"
MAX_POSTS = 1000
CACHE_FILE = "data/cached_posts.json"

def parse_telegram_channel():
    """Парсит последние посты из публичного Telegram канала."""
    all_posts = []
    url = CHANNEL_URL

    try:
        while len(all_posts) < MAX_POSTS and url:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')

            # Ищем контейнеры с сообщениями
            message_wrappers = soup.find_all('div', class_='tgme_widget_message_wrap')
            
            for wrap in message_wrappers:
                if len(all_posts) >= MAX_POSTS:
                    break

                post = {}

                # Извлекаем дату
                date_elem = wrap.find('a', class_='tgme_widget_message_date')
                if date_elem and date_elem.time:
                    post['date'] = date_elem.time['datetime']

                # Извлекаем текст
                text_elem = wrap.find('div', class_='tgme_widget_message_text')
                post['text'] = text_elem.get_text(strip=True) if text_elem else ""

                # Извлекаем фото (оригинальные ссылки)
                photo_elem = wrap.find('a', class_='tgme_widget_message_photo_wrap')
                post['photo_url'] = photo_elem.get('style', '') if photo_elem else ""
                if post['photo_url']:
                    # Извлекаем URL из style="background-image:url('...')"
                    match = re.search(r"url\('(.*?)'\)", post['photo_url'])
                    post['photo_url'] = match.group(1) if match else ""

                # Извлекаем видео (прямые ссылки)
                video_elem = wrap.find('video', class_='tgme_widget_message_video')
                if video_elem and video_elem.find('source'):
                    post['video_url'] = video_elem.find('source')['src']
                else:
                    post['video_url'] = ""

                # Ссылки внутри текста
                post['links'] = [a['href'] for a in wrap.find_all('a', href=True) if 't.me' not in a['href']]

                if post['text'] or post['photo_url'] or post['video_url']:
                    all_posts.append(post)

            # Ищем ссылку для загрузки более старых постов
            load_more = soup.find('a', class_='tme_messages_more')
            url = f"https://t.me{load_more['href']}" if load_more and load_more.get('href') else None

    except requests.RequestException as e:
        print(f"Ошибка при загрузке страницы: {e}")
        return []

    return all_posts

def update_cache(new_posts):
    """Обновляет кеш, сохраняя только актуальные данные."""
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)

    # Загружаем существующий кеш
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            cached_data = json.load(f)
    else:
        cached_data = []

    # Создаем словарь существующих постов по тексту и медиа для быстрого поиска
    existing_posts_map = {(p.get('text', ''), p.get('photo_url', ''), p.get('video_url', '')): p for p in cached_data}

    # Добавляем новые посты, если они еще не в кеше
    for post in new_posts:
        post_key = (post.get('text', ''), post.get('photo_url', ''), post.get('video_url', ''))
        if post_key not in existing_posts_map:
            cached_data.append(post)
            existing_posts_map[post_key] = post

    # Сохраняем только последние MAX_POSTS постов
    cached_data = cached_data[-MAX_POSTS:]

    # Сохраняем обновленный кеш
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cached_data, f, ensure_ascii=False, indent=2)

    print(f"Кеш обновлен. Всего постов: {len(cached_data)}")
    return cached_data

if __name__ == "__main__":
    print("Запуск парсинга канала...")
    posts = parse_telegram_channel()
    if posts:
        update_cache(posts)
        print(f"Успешно получено {len(posts)} постов.")
    else:
        print("Не удалось получить посты.")
