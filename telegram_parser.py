#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Telegram Channel Parser v2.0
Парсер публичного Telegram канала с улучшенной производительностью и надежностью

Улучшения:
- Поддержка альбомов (множественные фото в одном посте)
- Улучшенное извлечение ссылок
- Retry механизм с экспоненциальной задержкой
- Лучшее логирование и обработка ошибок
- Оптимизация памяти для больших каналов
"""

import json
import os
import re
import time
import hashlib
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from bs4 import BeautifulSoup
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ============================================
# КОНФИГУРАЦИЯ
# ============================================

CONFIG = {
    'CHANNEL_URL': 'https://t.me/s/abakan_mebel',
    'MAX_POSTS': 200,
    'CACHE_FILE': 'data/cached_posts.json',
    'LATEST_FILE': 'data/latest_posts.json',
    
    # Retry настройки
    'MAX_RETRIES': 3,
    'RETRY_DELAY': 2,
    'RETRY_BACKOFF': 2,
    
    # Таймауты
    'REQUEST_TIMEOUT': 30,
    'DELAY_BETWEEN_REQUESTS': 1,
    
    # User-Agent
    'USER_AGENT': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    
    # Лимиты
    'MAX_TEXT_LENGTH': 10000,
    'MAX_LINKS_PER_POST': 20,
}

# ============================================
# ЛОГИРОВАНИЕ
# ============================================

class Logger:
    """Простой логгер с цветным выводом"""
    
    COLORS = {
        'INFO': '\033[92m',    # Зеленый
        'WARN': '\033[93m',    # Желтый
        'ERROR': '\033[91m',   # Красный
        'DEBUG': '\033[94m',   # Синий
        'RESET': '\033[0m'
    }
    
    @staticmethod
    def log(level: str, message: str):
        color = Logger.COLORS.get(level, '')
        reset = Logger.COLORS['RESET']
        timestamp = datetime.now().strftime('%H:%M:%S')
        print(f"{color}[{timestamp}] [{level}]{reset} {message}")
    
    @staticmethod
    def info(msg: str): Logger.log('INFO', msg)
    
    @staticmethod
    def warn(msg: str): Logger.log('WARN', msg)
    
    @staticmethod
    def error(msg: str): Logger.log('ERROR', msg)
    
    @staticmethod
    def debug(msg: str): Logger.log('DEBUG', msg)


# ============================================
# HTTP КЛИЕНТ С RETRY
# ============================================

def create_session() -> requests.Session:
    """Создает сессию с автоматическим retry"""
    session = requests.Session()
    
    retry_strategy = Retry(
        total=CONFIG['MAX_RETRIES'],
        backoff_factor=CONFIG['RETRY_BACKOFF'],
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    
    session.headers.update({
        'User-Agent': CONFIG['USER_AGENT'],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
    })
    
    return session


# ============================================
# ПАРСИНГ ПОСТОВ
# ============================================

def extract_post_id(wrap_element) -> Optional[str]:
    """Извлекает ID поста"""
    message_div = wrap_element.find('div', class_='tgme_widget_message')
    if message_div and 'data-post' in message_div.attrs:
        return message_div['data-post']
    return None


def extract_post_date(wrap_element) -> str:
    """Извлекает дату поста"""
    date_elem = wrap_element.find('a', class_='tgme_widget_message_date')
    if date_elem:
        # Пробуем получить datetime из тега time
        time_elem = date_elem.find('time')
        if time_elem and time_elem.has_attr('datetime'):
            return time_elem['datetime']
        # Fallback: текст даты
        return date_elem.get_text(strip=True)
    return ''


def extract_post_text(wrap_element) -> str:
    """Извлекает текст поста"""
    text_elem = wrap_element.find('div', class_='tgme_widget_message_text')
    if not text_elem:
        return ''
    
    # Заменяем <br> на переносы строк
    for br in text_elem.find_all('br'):
        br.replace_with('\n')
    
    text = text_elem.get_text().strip()
    
    # Ограничиваем длину
    if len(text) > CONFIG['MAX_TEXT_LENGTH']:
        text = text[:CONFIG['MAX_TEXT_LENGTH']] + '...'
    
    return text


def extract_photo_url(wrap_element) -> str:
    """Извлекает URL главного фото"""
    # Способ 1: Из стиля background-image
    photo_wrap = wrap_element.find('a', class_='tgme_widget_message_photo_wrap')
    if photo_wrap:
        style = photo_wrap.get('style', '')
        match = re.search(r"url\(['\"]?(.*?)['\"]?\)", style)
        if match:
            return match.group(1)
    
    # Способ 2: Из тега img
    img = wrap_element.find('img', class_='tgme_widget_message_photo')
    if img and img.get('src'):
        return img['src']
    
    return ''


def extract_video_url(wrap_element) -> str:
    """Извлекает URL видео"""
    video_elem = wrap_element.find('video', class_='tgme_widget_message_video')
    if video_elem:
        # Ищем source внутри video
        source = video_elem.find('source')
        if source and source.get('src'):
            return source['src']
        # Или напрямую из video
        if video_elem.get('src'):
            return video_elem['src']
    
    # Проверяем video_rounded для круглых видео
    video_rounded = wrap_element.find('video', class_='tgme_widget_message_video_rounded')
    if video_rounded:
        source = video_rounded.find('source')
        if source and source.get('src'):
            return source['src']
    
    return ''


def extract_links(wrap_element, text: str) -> List[str]:
    """Извлекает все внешние ссылки из поста"""
    links = []
    seen_urls = set()
    
    # Из текста поста
    text_elem = wrap_element.find('div', class_='tgme_widget_message_text')
    if text_elem:
        for link in text_elem.find_all('a', href=True):
            href = link['href']
            # Фильтруем внутренние ссылки Telegram и поисковые запросы
            if (href and 
                not href.startswith('https://t.me/') and
                not href.startswith('tg://') and
                not href.startswith('?q=') and
                href not in seen_urls):
                links.append(href)
                seen_urls.add(href)
    
    # Из блока link preview
    link_preview = wrap_element.find('a', class_='tgme_widget_message_link_preview')
    if link_preview and link_preview.get('href'):
        href = link_preview['href']
        if href not in seen_urls and not href.startswith('https://t.me/'):
            links.append(href)
            seen_urls.add(href)
    
    # Из других ссылок
    for link in wrap_element.find_all('a', class_='tgme_widget_message_link'):
        href = link.get('href', '')
        if (href and 
            not href.startswith('https://t.me/') and
            not href.startswith('?q=') and
            href not in seen_urls):
            links.append(href)
            seen_urls.add(href)
    
    return links[:CONFIG['MAX_LINKS_PER_POST']]


def extract_album_photos(wrap_element) -> List[str]:
    """Извлекает все фото из альбома"""
    photos = []
    
    # Ищем все обертки фото в альбоме
    album_wraps = wrap_element.find_all('a', class_='tgme_widget_message_photo_wrap')
    for wrap in album_wraps:
        style = wrap.get('style', '')
        match = re.search(r"url\(['\"]?(.*?)['\"]?\)", style)
        if match:
            photos.append(match.group(1))
    
    # Если не нашли через album wraps, пробуем через img
    if not photos:
        imgs = wrap_element.find_all('img', class_='tgme_widget_message_photo')
        for img in imgs:
            if img.get('src'):
                photos.append(img['src'])
    
    return photos


def parse_single_post(wrap_element) -> Optional[Dict[str, Any]]:
    """Парсит один пост"""
    post_id = extract_post_id(wrap_element)
    if not post_id:
        return None
    
    text = extract_post_text(wrap_element)
    photo_url = extract_photo_url(wrap_element)
    video_url = extract_video_url(wrap_element)
    links = extract_links(wrap_element, text)
    album_photos = extract_album_photos(wrap_element)
    
    # Пропускаем системные сообщения
    if text in ['Channel created', 'Channel photo updated'] and not photo_url:
        return None
    
    # Пропускаем пустые посты
    if not text and not photo_url and not video_url:
        return None
    
    post = {
        'id': post_id,
        'date': extract_post_date(wrap_element),
        'text': text,
        'photo_url': photo_url,
        'video_url': video_url,
        'links': links,
        'parsed_at': datetime.now().isoformat(),
    }
    
    # Добавляем альбом если есть
    if len(album_photos) > 1:
        post['media'] = [{'type': 'photo', 'url': url} for url in album_photos]
        post['is_album'] = True
    elif photo_url:
        post['media'] = [{'type': 'photo', 'url': photo_url}]
        post['is_album'] = False
    
    return post


def parse_telegram_channel() -> List[Dict[str, Any]]:
    """Парсит все посты из публичного Telegram канала"""
    all_posts = []
    next_url = CONFIG['CHANNEL_URL']
    session = create_session()
    
    Logger.info(f"Начинаем парсинг канала: {CONFIG['CHANNEL_URL']}")
    
    try:
        while len(all_posts) < CONFIG['MAX_POSTS'] and next_url:
            Logger.info(f"Загружаем: {next_url}")
            
            try:
                response = session.get(
                    next_url, 
                    timeout=CONFIG['REQUEST_TIMEOUT']
                )
                response.raise_for_status()
            except requests.RequestException as e:
                Logger.error(f"Ошибка запроса: {e}")
                break
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Ищем все сообщения
            message_wrappers = soup.find_all('div', class_='tgme_widget_message_wrap')
            Logger.info(f"Найдено сообщений на странице: {len(message_wrappers)}")
            
            for wrap in message_wrappers:
                if len(all_posts) >= CONFIG['MAX_POSTS']:
                    break
                
                post = parse_single_post(wrap)
                if post:
                    all_posts.append(post)
                    Logger.debug(f"Добавлен пост: {post['id']}")
            
            # Ищем кнопку "Загрузить предыдущие"
            load_more = soup.find('a', class_='tme_messages_more')
            if load_more and load_more.get('href'):
                next_url = f"https://t.me{load_more['href']}"
                Logger.info("Найдена ссылка на следующие сообщения")
            else:
                next_url = None
                Logger.info("Больше сообщений не найдено")
            
            # Задержка между запросами
            if next_url:
                time.sleep(CONFIG['DELAY_BETWEEN_REQUESTS'])
    
    except Exception as e:
        Logger.error(f"Неожиданная ошибка: {e}")
    
    Logger.info(f"Всего собрано постов: {len(all_posts)}")
    return all_posts


# ============================================
# КЕШИРОВАНИЕ
# ============================================

def load_cache() -> List[Dict[str, Any]]:
    """Загружает существующий кеш"""
    if not os.path.exists(CONFIG['CACHE_FILE']):
        return []
    
    try:
        with open(CONFIG['CACHE_FILE'], 'r', encoding='utf-8') as f:
            cached = json.load(f)
            Logger.info(f"Загружен существующий кеш: {len(cached)} постов")
            return cached
    except Exception as e:
        Logger.error(f"Ошибка при загрузке кеша: {e}")
        return []


def update_cache(new_posts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Обновляет кеш, сохраняя только актуальные данные"""
    os.makedirs(os.path.dirname(CONFIG['CACHE_FILE']), exist_ok=True)
    
    cached_posts = load_cache()
    
    # Создаем словарь для быстрого поиска
    existing_ids = {p.get('id'): i for i, p in enumerate(cached_posts) if p.get('id')}
    
    # Объединяем старые и новые посты
    for post in new_posts:
        post_id = post.get('id')
        if post_id and post_id in existing_ids:
            # Обновляем существующий пост
            cached_posts[existing_ids[post_id]] = post
        else:
            # Добавляем новый пост в начало
            cached_posts.insert(0, post)
    
    # Удаляем дубликаты и ограничиваем количество
    unique_posts = []
    seen_ids = set()
    
    for post in cached_posts:
        post_id = post.get('id')
        if post_id and post_id not in seen_ids:
            seen_ids.add(post_id)
            unique_posts.append(post)
    
    final_posts = unique_posts[:CONFIG['MAX_POSTS']]
    
    # Сохраняем
    try:
        with open(CONFIG['CACHE_FILE'], 'w', encoding='utf-8') as f:
            json.dump(final_posts, f, ensure_ascii=False, indent=2, default=str)
        Logger.info(f"Кеш сохранен. Всего постов: {len(final_posts)}")
    except Exception as e:
        Logger.error(f"Ошибка при сохранении кеша: {e}")
    
    # Сохраняем последние 10 постов
    if final_posts:
        try:
            with open(CONFIG['LATEST_FILE'], 'w', encoding='utf-8') as f:
                json.dump(final_posts[:10], f, ensure_ascii=False, indent=2, default=str)
            Logger.info(f"Создан файл с последними 10 постами")
        except Exception as e:
            Logger.warn(f"Не удалось создать файл с последними постами: {e}")
    
    return final_posts


# ============================================
# СТАТИСТИКА
# ============================================

def print_statistics(posts: List[Dict[str, Any]], new_count: int):
    """Выводит статистику парсинга"""
    print("\n" + "=" * 50)
    print("СТАТИСТИКА ПАРСИНГА")
    print("=" * 50)
    print(f"Получено новых постов: {new_count}")
    print(f"Всего в кеше: {len(posts)}")
    
    posts_with_photos = sum(1 for p in posts if p.get('photo_url'))
    posts_with_videos = sum(1 for p in posts if p.get('video_url'))
    posts_with_links = sum(1 for p in posts if p.get('links'))
    posts_with_albums = sum(1 for p in posts if p.get('is_album'))
    
    print(f"Постов с фото: {posts_with_photos}")
    print(f"Постов с видео: {posts_with_videos}")
    print(f"Постов со ссылками: {posts_with_links}")
    print(f"Альбомов: {posts_with_albums}")
    print("=" * 50)


# ============================================
# MAIN
# ============================================

def main():
    """Основная функция парсера"""
    print("=" * 50)
    print("Telegram Channel Parser v2.0")
    print(f"Канал: {CONFIG['CHANNEL_URL']}")
    print(f"Время запуска: {datetime.now().isoformat()}")
    print("=" * 50)
    
    # Парсим канал
    posts = parse_telegram_channel()
    
    if posts:
        # Обновляем кеш
        cached = update_cache(posts)
        
        # Выводим статистику
        print_statistics(cached, len(posts))
    else:
        Logger.warn("Не удалось получить посты из канала")
    
    print("\nПарсинг завершен.")


if __name__ == "__main__":
    main()
