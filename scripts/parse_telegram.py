import requests
import json
import os
import hashlib
from datetime import datetime
from pathlib import Path
import re
import sys
import time

class SimpleTelegramParser:
    def __init__(self, channel_name, max_posts=1000):
        self.channel_name = channel_name
        self.max_posts = max_posts
        self.base_url = f"https://t.me/s/{channel_name}"
        self.data_dir = Path("data")
        self.posts_dir = self.data_dir / "posts"
        self.setup_dirs()
        
    def setup_dirs(self):
        self.posts_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
    def fetch_channel(self):
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        try:
            response = requests.get(self.base_url, headers=headers, timeout=30)
            response.raise_for_status()
            return response.text
        except Exception as e:
            print(f"Error fetching Telegram: {e}")
            return None
    
    def parse_messages(self, html):
        posts = []
        
        # Упрощенный парсинг - в реальности нужно доработать под структуру Telegram
        # Ищем ID сообщений
        message_pattern = r'data-post="([^"]+)"'
        matches = re.findall(message_pattern, html)
        
        for i, post_id_full in enumerate(matches[:self.max_posts]):
            try:
                post_id = post_id_full.split('/')[-1] if '/' in post_id_full else post_id_full
                
                # Ищем текст сообщения (упрощенно)
                text_pattern = rf'data-post="{re.escape(post_id_full)}"[^>]*>.*?<div class="tgme_widget_message_text[^>]*>(.*?)</div>'
                text_match = re.search(text_pattern, html, re.DOTALL)
                text = text_match.group(1).strip() if text_match else f"Сообщение #{i+1}"
                
                # Очищаем HTML из текста
                text = re.sub(r'<[^>]+>', '', text)
                
                # Ищем дату
                date_pattern = rf'data-post="{re.escape(post_id_full)}"[^>]*>.*?<time[^>]*datetime="([^"]+)"'
                date_match = re.search(date_pattern, html, re.DOTALL)
                date_str = date_match.group(1) if date_match else datetime.now().isoformat()
                
                post = {
                    'id': post_id,
                    'text': text,
                    'date': date_str,
                    'timestamp': int(datetime.now().timestamp()) - i*60,
                    'hashtags': re.findall(r'#(\w+)', text),
                    'word_count': len(text.split()),
                    'source': 'telegram'
                }
                posts.append(post)
            except Exception as e:
                print(f"Error parsing message {i}: {e}")
                continue
                
        # Если ничего не нашли, создаем демо-данные
        if not posts:
            print("No posts found, creating demo data")
            posts = [{
                'id': f'demo_{i}',
                'text': f'🚀 Пример поста #{i+1}. Система настроена! Настоящие посты появятся после настройки парсера. Канал: @abakan_mebel',
                'date': datetime.now().isoformat(),
                'timestamp': int(datetime.now().timestamp()) - i*3600,
                'hashtags': ['тест', 'демо'],
                'word_count': 20,
                'source': 'demo'
            } for i in range(10)]
        
        return posts
        
    def save_posts(self, posts):
        # Сохраняем все посты (до 1000)
        all_posts = sorted(posts, key=lambda x: x.get('timestamp', 0), reverse=True)[:self.max_posts]
        
        # Сохраняем основной файл
        posts_file = self.data_dir / "posts.json"
        with open(posts_file, 'w', encoding='utf-8') as f:
            json.dump({
                'channel': self.channel_name,
                'updated_at': datetime.now().isoformat(),
                'post_count': len(all_posts),
                'max_posts': self.max_posts,
                'posts': all_posts
            }, f, ensure_ascii=False, indent=2)
        
        # Сохраняем статистику
        stats_file = self.data_dir / "stats.json"
        hashtags_count = {}
        for post in all_posts:
            for tag in post.get('hashtags', []):
                hashtags_count[tag] = hashtags_count.get(tag, 0) + 1
        
        with open(stats_file, 'w', encoding='utf-8') as f:
            json.dump({
                'total_posts': len(all_posts),
                'total_words': sum(p.get('word_count', 0) for p in all_posts),
                'hashtags': dict(sorted(hashtags_count.items(), key=lambda x: x[1], reverse=True)[:10]),
                'last_updated': datetime.now().isoformat(),
                'channel': self.channel_name
            }, f, ensure_ascii=False, indent=2)
                
        return len(all_posts)
            
    def run(self):
        print(f"Парсинг канала: {self.channel_name}")
        html = self.fetch_channel()
        
        if not html:
            print("Не удалось получить данные из Telegram, используем демо-данные")
            posts = [{
                'id': f'demo_{i}',
                'text': f'Пример поста #{i+1}. Настройте парсер для получения реальных данных с @abakan_mebel',
                'date': datetime.now().isoformat(),
                'timestamp': int(datetime.now().timestamp()) - i*3600,
                'hashtags': ['тест'],
                'word_count': 15,
                'source': 'demo'
            } for i in range(5)]
        else:
            posts = self.parse_messages(html)
                
        saved = self.save_posts(posts)
        print(f"Сохранено постов: {saved}")
        return saved

if __name__ == "__main__":
    channel = os.getenv('CHANNEL', 'abakan_mebel')
    max_posts = int(os.getenv('MAX_POSTS', '1000'))
    parser = SimpleTelegramParser(channel, max_posts)
    parser.run()
