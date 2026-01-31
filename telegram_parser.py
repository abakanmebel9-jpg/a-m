import json
import os
import re
import time
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from threading import Thread, Event
import schedule
from bs4 import BeautifulSoup
import requests
from urllib.parse import urlparse

# Настройки
CHANNEL_URL = "https://t.me/s/abakan_mebel"
MAX_POSTS = 300
CACHE_FILE = "data/cached_posts.json"
STATUS_FILE = "data/parser_status.json"
LOG_FILE = "logs/parser.log"

# Настройка логирования
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class TelegramChannelParser:
    def __init__(self, channel_url: str, max_posts: int = 300):
        self.channel_url = channel_url
        self.max_posts = max_posts
        self.cache_file = CACHE_FILE
        self.status_file = STATUS_FILE
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        })
        self.stop_event = Event()
        
    def load_cache(self) -> List[Dict]:
        """Загружает кэшированные посты."""
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Ошибка загрузки кэша: {e}")
        return []
    
    def save_cache(self, posts: List[Dict]) -> None:
        """Сохраняет посты в кэш."""
        os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
        try:
            # Ограничиваем количество постов и сортируем по дате (новые первые)
            posts = sorted(posts, key=lambda x: x.get('date', ''), reverse=True)[:self.max_posts]
            
            with open(self.cache_file, 'w', encoding='utf-8') as f:
                json.dump(posts, f, ensure_ascii=False, indent=2, default=str)
            logger.info(f"Кэш сохранен: {len(posts)} постов")
        except Exception as e:
            logger.error(f"Ошибка сохранения кэша: {e}")
    
    def save_status(self, status: Dict) -> None:
        """Сохраняет статус парсера."""
        os.makedirs(os.path.dirname(self.status_file), exist_ok=True)
        try:
            with open(self.status_file, 'w', encoding='utf-8') as f:
                json.dump(status, f, ensure_ascii=False, indent=2, default=str)
        except Exception as e:
            logger.error(f"Ошибка сохранения статуса: {e}")
    
    def load_status(self) -> Dict:
        """Загружает статус парсера."""
        if os.path.exists(self.status_file):
            try:
                with open(self.status_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Ошибка загрузки статуса: {e}")
        return {"last_run": None, "last_success": None, "total_runs": 0, "errors": 0}
    
    def extract_media_url(self, element, class_name: str, attr: str = 'style') -> Optional[str]:
        """Извлекает URL медиа из элемента."""
        if not element:
            return None
        
        # Пытаемся извлечь из стиля
        if attr == 'style':
            style = element.get('style', '')
            if style:
                match = re.search(r"url\('(.*?)'\)", style)
                if match:
                    return match.group(1)
        
        # Пытаемся извлечь из src
        if element.get('src'):
            return element['src']
        
        # Пытаемся найти вложенные элементы
        for tag in ['img', 'video', 'source']:
            media = element.find(tag)
            if media and media.get('src'):
                return media['src']
        
        return None
    
    def parse_post(self, post_wrapper) -> Optional[Dict]:
        """Парсит отдельный пост."""
        try:
            post = {
                'id': None,
                'date': '',
                'text': '',
                'photo_url': '',
                'video_url': '',
                'links': [],
                'views': 0,
                'last_updated': datetime.now().isoformat()
            }
            
            # Извлекаем ID сообщения
            message_div = post_wrapper.find('div', class_='tgme_widget_message')
            if message_div and 'data-post' in message_div.attrs:
                post['id'] = message_div['data-post']
            
            # Если нет ID, пропускаем пост
            if not post['id']:
                return None
            
            # Извлекаем дату
            date_elem = post_wrapper.find('a', class_='tgme_widget_message_date')
            if date_elem and date_elem.time:
                post['date'] = date_elem.time['datetime']
            elif date_elem:
                post['date'] = date_elem.text.strip()
            
            # Извлекаем текст
            text_elem = post_wrapper.find('div', class_='tgme_widget_message_text')
            if text_elem:
                # Заменяем переносы строк
                for br in text_elem.find_all('br'):
                    br.replace_with('\n')
                
                # Извлекаем чистый текст
                post['text'] = text_elem.get_text().strip()
                
                # Извлекаем ссылки из текста
                for link in text_elem.find_all('a', href=True):
                    href = link.get('href', '')
                    if href and not href.startswith('https://t.me/'):
                        # Нормализуем ссылку
                        parsed = urlparse(href)
                        if parsed.netloc and parsed.netloc not in ['t.me', 'telegram.me']:
                            if href not in post['links']:
                                post['links'].append(href)
            
            # Извлекаем фото
            photo_wrap = post_wrapper.find('a', class_='tgme_widget_message_photo_wrap')
            if photo_wrap:
                photo_url = self.extract_media_url(photo_wrap, 'tgme_widget_message_photo_wrap')
                if photo_url:
                    post['photo_url'] = photo_url
            
            # Извлекаем видео
            video_elem = post_wrapper.find('video', class_='tgme_widget_message_video')
            if video_elem:
                video_url = self.extract_media_url(video_elem, 'tgme_widget_message_video')
                if video_url:
                    post['video_url'] = video_url
            
            # Извлекаем просмотры
            views_elem = post_wrapper.find('span', class_='tgme_widget_message_views')
            if views_elem:
                views_text = views_elem.get_text().strip()
                if views_text:
                    # Убираем нецифровые символы
                    numbers = re.findall(r'\d+', views_text.replace(' ', ''))
                    if numbers:
                        post['views'] = int(''.join(numbers))
            
            # Ищем дополнительные медиа (группы фото/видео)
            for gallery_item in post_wrapper.find_all('div', class_='tgme_widget_message_grouped_wrap'):
                photo = gallery_item.find('a', class_='tgme_widget_message_photo_wrap')
                if photo:
                    photo_url = self.extract_media_url(photo, 'tgme_widget_message_photo_wrap')
                    if photo_url and not post['photo_url']:
                        post['photo_url'] = photo_url
            
            return post if (post['text'] or post['photo_url'] or post['video_url']) else None
            
        except Exception as e:
            logger.error(f"Ошибка парсинга поста: {e}")
            return None
    
    def parse_channel(self, max_posts: Optional[int] = None) -> List[Dict]:
        """Парсит канал начиная с последних постов."""
        if max_posts is None:
            max_posts = self.max_posts
            
        all_posts = []
        next_url = self.channel_url
        parsed_ids = set()
        
        logger.info(f"Начинаем парсинг канала: {self.channel_url}")
        
        try:
            while len(all_posts) < max_posts and next_url and not self.stop_event.is_set():
                logger.debug(f"Загружаем: {next_url}")
                
                response = self.session.get(next_url, timeout=60)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Ищем все сообщения
                message_wrappers = soup.find_all('div', class_='tgme_widget_message_wrap')
                logger.debug(f"Найдено сообщений на странице: {len(message_wrappers)}")
                
                for wrapper in message_wrappers:
                    if self.stop_event.is_set() or len(all_posts) >= max_posts:
                        break
                    
                    post = self.parse_post(wrapper)
                    if post and post['id'] and post['id'] not in parsed_ids:
                        parsed_ids.add(post['id'])
                        all_posts.append(post)
                        logger.debug(f"Добавлен пост {post['id']} от {post['date']}")
                
                # Ищем кнопку "Загрузить предыдущие"
                load_more = soup.find('a', class_='tme_messages_more')
                if load_more and load_more.get('href'):
                    next_url = f"https://t.me{load_more['href']}"
                    logger.debug("Найдена ссылка на следующие сообщения")
                    
                    # Задержка для избежания блокировки
                    time.sleep(1)
                else:
                    next_url = None
                    logger.debug("Больше сообщений не найдено")
            
            logger.info(f"Парсинг завершен. Собрано постов: {len(all_posts)}")
            return all_posts
            
        except requests.RequestException as e:
            logger.error(f"Ошибка сети: {e}")
        except Exception as e:
            logger.error(f"Неожиданная ошибка при парсинге: {e}")
        
        return all_posts
    
    def merge_posts(self, old_posts: List[Dict], new_posts: List[Dict]) -> List[Dict]:
        """Объединяет старые и новые посты, обновляя существующие."""
        # Создаем словарь для быстрого доступа
        posts_dict = {post['id']: post for post in old_posts if post.get('id')}
        
        # Обновляем или добавляем новые посты
        for new_post in new_posts:
            post_id = new_post.get('id')
            if not post_id:
                continue
                
            if post_id in posts_dict:
                # Обновляем существующий пост
                old_post = posts_dict[post_id]
                
                # Обновляем только если есть новые данные
                if new_post.get('photo_url') and new_post['photo_url'] != old_post.get('photo_url'):
                    old_post['photo_url'] = new_post['photo_url']
                
                if new_post.get('video_url') and new_post['video_url'] != old_post.get('video_url'):
                    old_post['video_url'] = new_post['video_url']
                
                if new_post.get('views', 0) > old_post.get('views', 0):
                    old_post['views'] = new_post['views']
                
                # Обновляем ссылки (добавляем только новые)
                for link in new_post.get('links', []):
                    if link not in old_post.get('links', []):
                        old_post.setdefault('links', []).append(link)
                
                old_post['last_updated'] = datetime.now().isoformat()
            else:
                # Добавляем новый пост
                posts_dict[post_id] = new_post
        
        # Преобразуем обратно в список и сортируем по дате
        merged = list(posts_dict.values())
        merged.sort(key=lambda x: x.get('date', ''), reverse=True)
        
        return merged
    
    def update_posts(self) -> bool:
        """Основная функция обновления постов."""
        logger.info("=" * 50)
        logger.info("Начало обновления постов")
        logger.info(f"Время запуска: {datetime.now().isoformat()}")
        
        status = self.load_status()
        status['last_run'] = datetime.now().isoformat()
        status['total_runs'] = status.get('total_runs', 0) + 1
        
        try:
            # Загружаем существующие посты
            cached_posts = self.load_cache()
            logger.info(f"Загружено из кэша: {len(cached_posts)} постов")
            
            # Парсим новые посты
            new_posts = self.parse_channel()
            
            if new_posts:
                # Объединяем с существующими
                all_posts = self.merge_posts(cached_posts, new_posts)
                
                # Сохраняем обновленный кэш
                self.save_cache(all_posts)
                
                # Обновляем статус
                status['last_success'] = datetime.now().isoformat()
                status['last_post_count'] = len(all_posts)
                status['new_posts_added'] = len(new_posts)
                status['errors'] = status.get('errors', 0)
                
                # Логируем статистику
                logger.info("=" * 50)
                logger.info("СТАТИСТИКА ОБНОВЛЕНИЯ:")
                logger.info(f"Всего постов в кэше: {len(all_posts)}")
                logger.info(f"Новых постов получено: {len(new_posts)}")
                logger.info(f"Постов с фото: {sum(1 for p in all_posts if p.get('photo_url'))}")
                logger.info(f"Постов с видео: {sum(1 for p in all_posts if p.get('video_url'))}")
                logger.info(f"Постов со ссылками: {sum(1 for p in all_posts if p.get('links'))}")
                logger.info(f"Среднее количество просмотров: {sum(p.get('views', 0) for p in all_posts) // max(1, len(all_posts))}")
                logger.info("=" * 50)
                
                # Сохраняем последние 20 постов отдельно для быстрого доступа
                self.save_latest_posts(all_posts[:20])
                
                success = True
            else:
                logger.warning("Не удалось получить новые посты")
                success = False
                
        except Exception as e:
            logger.error(f"Ошибка при обновлении постов: {e}")
            status['errors'] = status.get('errors', 0) + 1
            success = False
        
        self.save_status(status)
        logger.info("Обновление завершено")
        
        return success
    
    def save_latest_posts(self, posts: List[Dict]) -> None:
        """Сохраняет последние посты в отдельный файл."""
        try:
            latest_file = "data/latest_posts.json"
            os.makedirs(os.path.dirname(latest_file), exist_ok=True)
            
            with open(latest_file, 'w', encoding='utf-8') as f:
                json.dump(posts, f, ensure_ascii=False, indent=2, default=str)
            
            logger.debug(f"Сохранены последние {len(posts)} постов")
        except Exception as e:
            logger.error(f"Ошибка сохранения последних постов: {e}")
    
    def run_scheduled(self, interval_hours: int = 1) -> None:
        """Запускает парсер по расписанию."""
        logger.info(f"Запуск планировщика с интервалом {interval_hours} час(ов)")
        
        # Немедленный запуск при старте
        self.update_posts()
        
        # Настройка расписания
        schedule.every(interval_hours).hours.do(self.update_posts)
        
        # Основной цикл планировщика
        while not self.stop_event.is_set():
            try:
                schedule.run_pending()
                time.sleep(60)  # Проверяем каждую минуту
            except KeyboardInterrupt:
                logger.info("Получен сигнал прерывания")
                break
            except Exception as e:
                logger.error(f"Ошибка в планировщике: {e}")
                time.sleep(300)  # Ждем 5 минут при ошибке
        
        logger.info("Планировщик остановлен")
    
    def stop(self) -> None:
        """Останавливает парсер."""
        self.stop_event.set()
        logger.info("Парсер остановлен")


def main():
    """Основная функция."""
    parser = TelegramChannelParser(CHANNEL_URL, MAX_POSTS)
    
    print("=" * 50)
    print("Telegram Channel Parser")
    print(f"Канал: {CHANNEL_URL}")
    print(f"Максимум постов: {MAX_POSTS}")
    print("=" * 50)
    print("Режимы работы:")
    print("1. Однократный запуск")
    print("2. Запуск по расписанию (раз в час)")
    print("3. Только обновление существующего кэша")
    print("=" * 50)
    
    try:
        mode = input("Выберите режим (1-3): ").strip()
        
        if mode == "1":
            print("Однократный запуск...")
            parser.update_posts()
            
        elif mode == "2":
            print("Запуск по расписанию...")
            print("Парсер будет работать в фоне.")
            print("Для остановки нажмите Ctrl+C")
            print("=" * 50)
            
            try:
                parser.run_scheduled(interval_hours=1)
            except KeyboardInterrupt:
                parser.stop()
                
        elif mode == "3":
            print("Обновление кэша...")
            cached = parser.load_cache()
            if cached:
                parser.save_cache(cached)
                print(f"Кэш обновлен: {len(cached)} постов")
            else:
                print("Кэш пуст. Запустите парсинг сначала.")
                
        else:
            print("Неверный режим. Запускаю однократный парсинг...")
            parser.update_posts()
            
    except KeyboardInterrupt:
        print("\nПрервано пользователем")
    except Exception as e:
        logger.error(f"Ошибка в главной функции: {e}")


if __name__ == "__main__":
    main()
