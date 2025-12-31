# api_server.py
from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import json
import logging
import asyncio
from typing import Dict, Any
import hashlib
import hmac
import time
import os

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="CS2 Bot API", version="1.0.0")

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене замените на домен вашего Mini App
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Конфигурация (используйте те же данные что и в боте)
TOKEN = "7836761722:AAGzXQjiYuX_MOM9ZpMvrVtBx3175giOprQ"
BOT_URL = f"https://api.telegram.org/bot{TOKEN}"
ADMIN_IDS = [1003215844]
REQUIRED_CHANNEL = "@ranworkcs"

# Пути к файлам данных
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
PROMO_CODES_FILE = os.path.join(DATA_DIR, "promo_codes.json")

# Создаем директорию для данных, если ее нет
os.makedirs(DATA_DIR, exist_ok=True)

# Загрузка данных
def load_users() -> Dict[str, Any]:
    """Загружает пользователей из файла"""
    try:
        if os.path.exists(USERS_FILE):
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Ошибка загрузки пользователей: {e}")
    return {}

def load_promo_codes() -> Dict[str, Any]:
    """Загружает промокоды из файла"""
    try:
        if os.path.exists(PROMO_CODES_FILE):
            with open(PROMO_CODES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Ошибка загрузки промокодов: {e}")
    return {}

def save_users(users: Dict[str, Any]) -> bool:
    """Сохраняет пользователей в файл"""
    try:
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(users, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        logger.error(f"Ошибка сохранения пользователей: {e}")
        return False

def save_promo_codes(promo_codes: Dict[str, Any]) -> bool:
    """Сохраняет промокоды в файл"""
    try:
        with open(PROMO_CODES_FILE, 'w', encoding='utf-8') as f:
            json.dump(promo_codes, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        logger.error(f"Ошибка сохранения промокодов: {e}")
        return False

# Валидация данных из Telegram
def validate_telegram_data(init_data: str) -> Dict[str, Any]:
    """Валидирует данные из Telegram Web App"""
    try:
        # Разбираем параметры
        params = {}
        for item in init_data.split('&'):
            key, value = item.split('=', 1)
            params[key] = value
        
        # Извлекаем hash
        data_hash = params.pop('hash', '')
        
        # Создаем секретный ключ
        secret_key = hmac.new(
            key=b"WebAppData",
            msg=TOKEN.encode(),
            digestmod=hashlib.sha256
        ).digest()
        
        # Проверяем подпись
        data_check_string = '\n'.join(
            f"{key}={params[key]}"
            for key in sorted(params.keys())
        )
        
        calculated_hash = hmac.new(
            key=secret_key,
            msg=data_check_string.encode(),
            digestmod=hashlib.sha256
        ).hexdigest()
        
        if calculated_hash != data_hash:
            raise ValueError("Неверная подпись данных")
        
        # Парсим данные пользователя
        user_data = {}
        if 'user' in params:
            user_data = json.loads(params['user'].replace('%22', '"').replace('%7B', '{').replace('%7D', '}'))
        
        return {
            'user': user_data,
            'auth_date': int(params.get('auth_date', 0)),
            'query_id': params.get('query_id', ''),
            'valid': True
        }
        
    except Exception as e:
        logger.error(f"Ошибка валидации данных: {e}")
        return {'valid': False, 'error': str(e)}

# Зависимость для проверки аутентификации
async def verify_telegram_auth(
    request: Request,
    authorization: str = Header(None)
) -> Dict[str, Any]:
    """Проверяет аутентификацию через Telegram"""
    if not authorization or not authorization.startswith("tma "):
        raise HTTPException(status_code=401, detail="Требуется аутентификация Telegram")
    
    init_data = authorization[4:]  # Убираем "tma "
    validated_data = validate_telegram_data(init_data)
    
    if not validated_data['valid']:
        raise HTTPException(status_code=401, detail="Неверные данные аутентификации")
    
    # Проверяем время (данные не старше суток)
    auth_time = validated_data.get('auth_date', 0)
    current_time = int(time.time())
    if current_time - auth_time > 86400:
        raise HTTPException(status_code=401, detail="Данные аутентификации устарели")
    
    return validated_data

# ===== API ENDPOINTS =====

@app.get("/")
async def root():
    return {"status": "online", "service": "CS2 Bot API"}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": time.time()}

@app.get("/api/user")
async def get_user_data(auth_data: Dict[str, Any] = Depends(verify_telegram_auth)):
    """Получение данных пользователя"""
    try:
        user_info = auth_data['user']
        user_id = user_info.get('id')
        
        if not user_id:
            raise HTTPException(status_code=400, detail="ID пользователя не найден")
        
        # Загружаем данные пользователя
        users = load_users()
        user_key = str(user_id)
        
        if user_key not in users:
            # Создаем нового пользователя
            users[user_key] = {
                "username": user_info.get('username'),
                "first_name": user_info.get('first_name'),
                "last_name": user_info.get('last_name', ''),
                "points": 100,  # Начальный баланс
                "subscribed": False,
                "referrals": [],
                "inventory": [],
                "used_promo_codes": [],
                "referral_code": f"ref_{user_id}",
                "referred_by": None,
                "last_daily_bonus": None,
                "trade_link": None,
                "steam_collab": None,
                "telegram_collab": None,
                "created_at": time.time()
            }
            save_users(users)
        
        user_data = users[user_key]
        
        # Формируем ответ
        return {
            "success": True,
            "user": {
                "id": user_id,
                "username": user_data.get("username"),
                "first_name": user_data.get("first_name"),
                "last_name": user_data.get("last_name"),
                "balance": user_data.get("points", 0),
                "inventory": user_data.get("inventory", []),
                "referral_code": user_data.get("referral_code"),
                "trade_link": user_data.get("trade_link"),
                "created_at": user_data.get("created_at"),
                "referrals_count": len(user_data.get("referrals", []))
            },
            "daily_bonus_available": check_daily_bonus_available(user_data)
        }
        
    except Exception as e:
        logger.error(f"Ошибка получения данных пользователя: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.post("/api/open-case")
async def open_case(
    data: Dict[str, Any],
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Открытие кейса"""
    try:
        user_info = auth_data['user']
        user_id = user_info.get('id')
        case_price = data.get('price')
        
        if not case_price:
            raise HTTPException(status_code=400, detail="Не указана цена кейса")
        
        # Загружаем данные
        users = load_users()
        user_key = str(user_id)
        
        if user_key not in users:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        user_data = users[user_key]
        
        # Проверяем баланс
        if user_data.get('points', 0) < case_price:
            return {
                "success": False,
                "error": "Недостаточно баллов",
                "required": case_price,
                "current": user_data.get('points', 0)
            }
        
        # Определяем выигрыш
        items_db = {
            500: ["Наклейка | ENCE |", "Наклейка | Grayhound", "Наклейка | PGL |"],
            3000: ["Наклейка | huNter |", "FAMAS | Колония", "UMP-45 | Внедорожник"],
            5000: ["Five-SeveN | Хладагент", "Капсула с наклейками", "Наклейка | XD"],
            10000: [
                "Наклейка | Клоунский парик", "Наклейка | Высокий полёт",
                "Sticker | From The Deep (Glitter)"
            ],
            15000: [
                "Наклейка | Гипноглаза", "Наклейка | Радужный путь",
                "Брелок | Щепотка соли"
            ],
        }
        
        import random
        available_items = items_db.get(case_price, [])
        if not available_items:
            raise HTTPException(status_code=400, detail="Неверная цена кейса")
        
        won_item = random.choice(available_items)
        item_price = case_price // 2  # Оценочная стоимость предмета
        
        # Обновляем данные пользователя
        user_data['points'] = user_data.get('points', 0) - case_price
        user_data['inventory'].append({
            "name": won_item,
            "price": item_price,
            "received_at": time.time()
        })
        
        # Сохраняем изменения
        users[user_key] = user_data
        save_users(users)
        
        return {
            "success": True,
            "item": won_item,
            "item_price": item_price,
            "new_balance": user_data['points'],
            "inventory": user_data['inventory']
        }
        
    except Exception as e:
        logger.error(f"Ошибка открытия кейса: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.post("/api/daily-bonus")
async def claim_daily_bonus(
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Получение ежедневного бонуса"""
    try:
        user_info = auth_data['user']
        user_id = user_info.get('id')
        
        # Загружаем данные
        users = load_users()
        user_key = str(user_id)
        
        if user_key not in users:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        user_data = users[user_key]
        
        # Проверяем доступность бонуса
        if not check_daily_bonus_available(user_data):
            return {
                "success": False,
                "error": "Бонус уже получен сегодня",
                "next_available": calculate_next_bonus_time(user_data)
            }
        
        # Начисляем бонус
        bonus_amount = 50
        user_data['points'] = user_data.get('points', 0) + bonus_amount
        user_data['last_daily_bonus'] = time.time()
        
        # Сохраняем изменения
        users[user_key] = user_data
        save_users(users)
        
        return {
            "success": True,
            "bonus": bonus_amount,
            "new_balance": user_data['points'],
            "next_available": calculate_next_bonus_time(user_data)
        }
        
    except Exception as e:
        logger.error(f"Ошибка получения бонуса: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.post("/api/activate-promo")
async def activate_promo_code(
    data: Dict[str, Any],
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Активация промокода"""
    try:
        user_info = auth_data['user']
        user_id = user_info.get('id')
        promo_code = data.get('promo_code', '').upper()
        
        if not promo_code:
            raise HTTPException(status_code=400, detail="Не указан промокод")
        
        # Загружаем данные
        users = load_users()
        promo_codes = load_promo_codes()
        user_key = str(user_id)
        
        if user_key not in users:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        user_data = users[user_key]
        
        # Проверяем, использовал ли пользователь уже этот промокод
        if promo_code in user_data.get('used_promo_codes', []):
            return {
                "success": False,
                "error": "Промокод уже использован"
            }
        
        # Проверяем существование промокода
        if promo_code not in promo_codes:
            return {
                "success": False,
                "error": "Неверный промокод"
            }
        
        promo_data = promo_codes[promo_code]
        
        # Проверяем лимит использований
        if promo_data['max_uses'] != -1 and promo_data['uses'] >= promo_data['max_uses']:
            return {
                "success": False,
                "error": "Лимит использований исчерпан"
            }
        
        # Начисляем баллы
        points = promo_data['points']
        user_data['points'] = user_data.get('points', 0) + points
        user_data['used_promo_codes'] = user_data.get('used_promo_codes', []) + [promo_code]
        
        # Обновляем счетчик использований промокода
        promo_data['uses'] = promo_data.get('uses', 0) + 1
        promo_codes[promo_code] = promo_data
        
        # Сохраняем изменения
        users[user_key] = user_data
        save_users(users)
        save_promo_codes(promo_codes)
        
        return {
            "success": True,
            "points": points,
            "new_balance": user_data['points'],
            "promo_code": promo_code
        }
        
    except Exception as e:
        logger.error(f"Ошибка активации промокода: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.post("/api/withdraw-item")
async def withdraw_item(
    data: Dict[str, Any],
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Запрос на вывод предмета"""
    try:
        user_info = auth_data['user']
        user_id = user_info.get('id')
        item_index = data.get('item_index')
        item_id = data.get('item_id')
        
        if item_index is None and item_id is None:
            raise HTTPException(status_code=400, detail="Не указан предмет")
        
        # Загружаем данные
        users = load_users()
        user_key = str(user_id)
        
        if user_key not in users:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        user_data = users[user_key]
        inventory = user_data.get('inventory', [])
        
        # Находим предмет
        item = None
        if item_id is not None:
            # Ищем по ID
            for inv_item in inventory:
                if inv_item.get('id') == item_id:
                    item = inv_item
                    break
        elif item_index is not None and 0 <= item_index < len(inventory):
            # Ищем по индексу
            item = inventory[item_index]
        
        if not item:
            return {
                "success": False,
                "error": "Предмет не найден"
            }
        
        # Проверяем трейд ссылку
        if not user_data.get('trade_link'):
            return {
                "success": False,
                "error": "Не указана трейд ссылка",
                "requires_trade_link": True
            }
        
        # Отправляем уведомление администратору (симуляция)
        # В реальном боте здесь будет отправка в Telegram
        admin_notification = {
            "user_id": user_id,
            "username": user_data.get('username'),
            "item": item,
            "trade_link": user_data.get('trade_link'),
            "timestamp": time.time(),
            "type": "single"
        }
        
        # Удаляем предмет из инвентаря
        if item_id is not None:
            user_data['inventory'] = [i for i in inventory if i.get('id') != item_id]
        else:
            user_data['inventory'].pop(item_index)
        
        # Сохраняем изменения
        users[user_key] = user_data
        save_users(users)
        
        # Здесь должна быть реальная отправка в Telegram бот
        logger.info(f"Запрос на вывод: {admin_notification}")
        
        return {
            "success": True,
            "message": "Запрос отправлен администратору",
            "item": item['name'],
            "remaining_items": len(user_data['inventory'])
        }
        
    except Exception as e:
        logger.error(f"Ошибка вывода предмета: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.post("/api/set-trade-link")
async def set_trade_link(
    data: Dict[str, Any],
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Установка трейд ссылки"""
    try:
        user_info = auth_data['user']
        user_id = user_info.get('id')
        trade_link = data.get('trade_link')
        
        if not trade_link:
            raise HTTPException(status_code=400, detail="Не указана трейд ссылка")
        
        # Простая валидация ссылки
        if "steamcommunity.com/tradeoffer/new/" not in trade_link:
            return {
                "success": False,
                "error": "Неверный формат трейд ссылки"
            }
        
        # Загружаем данные
        users = load_users()
        user_key = str(user_id)
        
        if user_key not in users:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Обновляем трейд ссылку
        users[user_key]['trade_link'] = trade_link
        save_users(users)
        
        return {
            "success": True,
            "message": "Трейд ссылка сохранена",
            "trade_link": trade_link
        }
        
    except Exception as e:
        logger.error(f"Ошибка сохранения трейд ссылки: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.get("/api/available-promos")
async def get_available_promos():
    """Получение списка доступных промокодов"""
    try:
        promo_codes = load_promo_codes()
        
        # Фильтруем активные промокоды
        available_promos = []
        for code, data in promo_codes.items():
            if data['max_uses'] == -1 or data['uses'] < data['max_uses']:
                available_promos.append({
                    "code": code,
                    "points": data['points'],
                    "remaining_uses": data['max_uses'] - data['uses'] if data['max_uses'] != -1 else "∞"
                })
        
        return {
            "success": True,
            "promos": available_promos
        }
        
    except Exception as e:
        logger.error(f"Ошибка получения промокодов: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

# Вспомогательные функции
def check_daily_bonus_available(user_data: Dict[str, Any]) -> bool:
    """Проверяет доступность ежедневного бонуса"""
    last_bonus = user_data.get('last_daily_bonus')
    if not last_bonus:
        return True
    
    # Проверяем, прошло ли больше 24 часов
    current_time = time.time()
    return (current_time - last_bonus) >= 86400

def calculate_next_bonus_time(user_data: Dict[str, Any]) -> int:
    """Рассчитывает время следующего доступного бонуса"""
    last_bonus = user_data.get('last_daily_bonus', 0)
    return int(last_bonus + 86400) if last_bonus else 0

# Запуск сервера
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
