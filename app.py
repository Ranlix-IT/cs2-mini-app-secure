# app.py - CS2 Bot API Server
from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
import json
import logging
import asyncio
from typing import Dict, Any, Optional
import hashlib
import hmac
import time
import os
from pathlib import Path
from pydantic import BaseModel

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="CS2 Bot API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Настройка CORS для Telegram Mini Apps
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://web.telegram.org",
        "https://tg-web.telegram.org",
        "https://telegram.org",
        "https://*.telegram.org",
        "https://*.t.me",
        "http://localhost:*",
        "http://127.0.0.1:*",
        "https://cs2-mini-app.onrender.com",
        "https://cs2-mini-app-secure.onrender.com",
        "*"  # Для тестирования
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

# Конфигурация бота
TOKEN = "7836761722:AAGzXQjiYuX_MOM9ZpMvrVtBx3175giOprQ"
ADMIN_IDS = [1003215844]
REQUIRED_CHANNEL = "@ranworkcs"

# Пути к файлам данных
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

USERS_FILE = DATA_DIR / "users.json"
PROMO_CODES_FILE = DATA_DIR / "promo_codes.json"

# Модели данных
class OpenCaseRequest(BaseModel):
    price: int

class ActivatePromoRequest(BaseModel):
    promo_code: str

class WithdrawItemRequest(BaseModel):
    item_id: Optional[str] = None
    item_index: Optional[int] = None

class SetTradeLinkRequest(BaseModel):
    trade_link: str

# Загрузка данных
def load_users() -> Dict[str, Any]:
    """Загружает пользователей из файла"""
    try:
        if USERS_FILE.exists():
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                logger.info(f"Загружено пользователей: {len(data)}")
                return data
    except Exception as e:
        logger.error(f"Ошибка загрузки пользователей: {e}")
    return {}

def load_promo_codes() -> Dict[str, Any]:
    """Загружает промокоды из файла"""
    try:
        if PROMO_CODES_FILE.exists():
            with open(PROMO_CODES_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Инициализируем uses для существующих промокодов если нет
                for code in data:
                    if 'uses' not in data[code]:
                        data[code]['uses'] = 0
                logger.info(f"Загружено промокодов: {len(data)}")
                return data
    except Exception as e:
        logger.error(f"Ошибка загрузки промокодов: {e}")
    
    # Если файла нет, создаем дефолтные промокоды
    default_promos = {
        "WELCOME1": {"points": 100, "max_uses": -1, "uses": 0, "description": "Добро пожаловать!"},
        "CS2FUN": {"points": 250, "max_uses": 100, "uses": 0, "description": "Для настоящих фанатов CS2"},
        "RANWORK": {"points": 500, "max_uses": 50, "uses": 0, "description": "От создателей бота"},
        "START100": {"points": 100, "max_uses": -1, "uses": 0, "description": "Стартовый бонус"},
        "MINIAPP": {"points": 200, "max_uses": 200, "uses": 0, "description": "За запуск Mini App"}
    }
    save_promo_codes(default_promos)
    return default_promos

def save_users(users: Dict[str, Any]) -> bool:
    """Сохраняет пользователей в файл"""
    try:
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(users, f, indent=2, ensure_ascii=False)
        logger.info(f"Сохранено пользователей: {len(users)}")
        return True
    except Exception as e:
        logger.error(f"Ошибка сохранения пользователей: {e}")
        return False

def save_promo_codes(promo_codes: Dict[str, Any]) -> bool:
    """Сохраняет промокоды в файл"""
    try:
        with open(PROMO_CODES_FILE, 'w', encoding='utf-8') as f:
            json.dump(promo_codes, f, indent=2, ensure_ascii=False)
        logger.info(f"Сохранено промокодов: {len(promo_codes)}")
        return True
    except Exception as e:
        logger.error(f"Ошибка сохранения промокодов: {e}")
        return False

# Валидация данных из Telegram
def validate_telegram_data(init_data: str) -> Dict[str, Any]:
    """Валидирует данные из Telegram Web App"""
    try:
        if not init_data:
            logger.warning("Пустые данные Telegram")
            return {'valid': False, 'error': 'Пустые данные Telegram'}
        
        # Разбираем параметры
        params = {}
        for item in init_data.split('&'):
            if '=' in item:
                key, value = item.split('=', 1)
                params[key] = value
        
        # Извлекаем hash
        data_hash = params.pop('hash', '')
        
        if not data_hash:
            logger.warning("Отсутствует hash в данных Telegram")
            return {'valid': False, 'error': 'Отсутствует hash'}
        
        # Создаем секретный ключ
        secret_key = hmac.new(
            key=b"WebAppData",
            msg=TOKEN.encode(),
            digestmod=hashlib.sha256
        ).digest()
        
        # Создаем data_check_string
        data_check_string = '\n'.join(
            f"{key}={value}"
            for key, value in sorted(params.items())
        )
        
        # Вычисляем hash
        calculated_hash = hmac.new(
            key=secret_key,
            msg=data_check_string.encode(),
            digestmod=hashlib.sha256
        ).hexdigest()
        
        if calculated_hash != data_hash:
            logger.warning(f"Неверная подпись данных: ожидалось {calculated_hash}, получено {data_hash}")
            return {'valid': False, 'error': 'Неверная подпись данных'}
        
        # Парсим данные пользователя
        user_data = {}
        if 'user' in params:
            import urllib.parse
            try:
                user_data = json.loads(urllib.parse.unquote(params['user']))
            except json.JSONDecodeError as e:
                logger.error(f"Ошибка декодирования user данных: {e}")
                return {'valid': False, 'error': 'Ошибка декодирования данных пользователя'}
        
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
    authorization: str = Header(None, alias="Authorization")
) -> Dict[str, Any]:
    """Проверяет аутентификацию через Telegram"""
    try:
        logger.info(f"Запрос на аутентификацию: {request.url.path}")
        
        if not authorization:
            logger.warning("Отсутствует заголовок Authorization")
            # Для тестирования разрешаем без авторизации некоторые endpoints
            if request.url.path in ["/api/health", "/api/available-promos", "/api/test"]:
                return {'user': {'id': 1003215844, 'first_name': 'Test', 'username': 'test'}, 'valid': True}
            raise HTTPException(status_code=401, detail="Требуется аутентификация Telegram")
        
        if not authorization.startswith("tma "):
            logger.warning(f"Неверный формат заголовка Authorization: {authorization[:20]}...")
            raise HTTPException(status_code=401, detail="Неверный формат аутентификации")
        
        init_data = authorization[4:]  # Убираем "tma "
        
        if not init_data:
            logger.warning("Пустые данные аутентификации")
            raise HTTPException(status_code=401, detail="Пустые данные аутентификации")
        
        validated_data = validate_telegram_data(init_data)
        
        if not validated_data.get('valid'):
            error_msg = validated_data.get('error', 'Неизвестная ошибка')
            logger.warning(f"Неверные данные аутентификации: {error_msg}")
            raise HTTPException(status_code=401, detail=f"Неверные данные аутентификации: {error_msg}")
        
        # Проверяем время (данные не старше суток)
        auth_time = validated_data.get('auth_date', 0)
        current_time = int(time.time())
        if current_time - auth_time > 86400:
            logger.warning(f"Данные аутентификации устарели: auth_time={auth_time}, current={current_time}")
            raise HTTPException(status_code=401, detail="Данные аутентификации устарели")
        
        logger.info(f"Успешная аутентификация пользователя: {validated_data.get('user', {}).get('id')}")
        return validated_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка проверки аутентификации: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера при проверке аутентификации")

# ===== API ENDPOINTS =====

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    """Отдача главной HTML страницы"""
    try:
        index_path = BASE_DIR / "index.html"
        if index_path.exists():
            with open(index_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            return HTMLResponse(content=html_content)
        else:
            return {
                "status": "online", 
                "service": "CS2 Bot API",
                "version": "1.0.0",
                "message": "HTML файл не найден, используйте API endpoints",
                "timestamp": time.time()
            }
    except Exception as e:
        logger.error(f"Ошибка загрузки index.html: {e}")
        raise HTTPException(status_code=500, detail="Ошибка загрузки страницы")

@app.get("/favicon.ico")
async def favicon():
    return FileResponse(BASE_DIR / "favicon.ico" if (BASE_DIR / "favicon.ico").exists() else BASE_DIR / "icon.png")

@app.get("/api/health")
async def health_check():
    """Проверка здоровья API"""
    return {
        "status": "healthy", 
        "service": "CS2 Bot API",
        "version": "1.0.0",
        "timestamp": time.time(),
        "users_count": len(load_users()),
        "promos_count": len(load_promo_codes()),
        "data_dir": str(DATA_DIR),
        "telegram_bot": "connected" if TOKEN else "disconnected"
    }

@app.get("/api/user")
async def get_user_data(auth_data: Dict[str, Any] = Depends(verify_telegram_auth)):
    """Получение данных пользователя"""
    try:
        user_info = auth_data['user']
        user_id = user_info.get('id')
        
        if not user_id:
            logger.warning("ID пользователя не найден")
            raise HTTPException(status_code=400, detail="ID пользователя не найден")
        
        logger.info(f"Получение данных пользователя: {user_id}")
        
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
                "referral_code": f"ref_{user_id}_{int(time.time())}",
                "referred_by": None,
                "last_daily_bonus": None,
                "trade_link": None,
                "steam_collab": None,
                "telegram_collab": None,
                "created_at": time.time(),
                "last_active": time.time()
            }
            save_users(users)
            logger.info(f"Создан новый пользователь: {user_id}")
        
        # Обновляем время последней активности
        users[user_key]["last_active"] = time.time()
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
                "referrals_count": len(user_data.get("referrals", [])),
                "subscribed": user_data.get("subscribed", False)
            },
            "daily_bonus_available": check_daily_bonus_available(user_data),
            "server_time": time.time()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения данных пользователя: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.post("/api/open-case")
async def open_case(
    data: OpenCaseRequest,
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Открытие кейса"""
    try:
        user_info = auth_data['user']
        user_id = user_info.get('id')
        case_price = data.price
        
        if not case_price or case_price <= 0:
            raise HTTPException(status_code=400, detail="Неверная цена кейса")
        
        logger.info(f"Пользователь {user_id} открывает кейс за {case_price}")
        
        # Загружаем данные
        users = load_users()
        user_key = str(user_id)
        
        if user_key not in users:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        user_data = users[user_key]
        
        # Проверяем баланс
        user_balance = user_data.get('points', 0)
        if user_balance < case_price:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Недостаточно баллов",
                    "required": case_price,
                    "current": user_balance,
                    "message": "Пополните баланс или выполните задания"
                }
            )
        
        # Определяем выигрыш
        items_db = {
            500: [
                {"name": "Наклейка | ENCE |", "type": "sticker", "rarity": "common"},
                {"name": "Наклейка | Grayhound", "type": "sticker", "rarity": "common"},
                {"name": "Наклейка | PGL |", "type": "sticker", "rarity": "common"}
            ],
            3000: [
                {"name": "Наклейка | huNter |", "type": "sticker", "rarity": "uncommon"},
                {"name": "FAMAS | Колония", "type": "weapon", "rarity": "uncommon"},
                {"name": "UMP-45 | Внедорожник", "type": "weapon", "rarity": "uncommon"}
            ],
            5000: [
                {"name": "Five-SeveN | Хладагент", "type": "weapon", "rarity": "rare"},
                {"name": "Капсула с наклейками", "type": "case", "rarity": "rare"},
                {"name": "Наклейка | XD", "type": "sticker", "rarity": "rare"}
            ],
            10000: [
                {"name": "Наклейка | Клоунский парик", "type": "sticker", "rarity": "epic"},
                {"name": "Наклейка | Высокий полёт", "type": "sticker", "rarity": "epic"},
                {"name": "Sticker | From The Deep (Glitter)", "type": "sticker", "rarity": "epic"}
            ],
            15000: [
                {"name": "Наклейка | Гипноглаза", "type": "sticker", "rarity": "legendary"},
                {"name": "Наклейка | Радужный путь", "type": "sticker", "rarity": "legendary"},
                {"name": "Брелок | Щепотка соли", "type": "collectible", "rarity": "legendary"}
            ],
        }
        
        import random
        available_items = items_db.get(case_price, [])
        if not available_items:
            raise HTTPException(status_code=400, detail="Неверная цена кейса")
        
        # Выбираем предмет с учетом редкости
        won_item_data = random.choice(available_items)
        won_item = won_item_data["name"]
        item_type = won_item_data["type"]
        item_rarity = won_item_data["rarity"]
        
        # Определяем цену предмета (от 50% до 150% от цены кейса)
        item_price = int(case_price * random.uniform(0.5, 1.5))
        
        # Обновляем данные пользователя
        user_data['points'] = user_data.get('points', 0) - case_price
        user_data['inventory'].append({
            "id": str(int(time.time() * 1000)),
            "name": won_item,
            "price": item_price,
            "type": item_type,
            "rarity": item_rarity,
            "received_at": time.time(),
            "case_price": case_price
        })
        
        # Сохраняем изменения
        users[user_key] = user_data
        save_users(users)
        
        logger.info(f"Пользователь {user_id} выиграл: {won_item} (цена: {item_price})")
        
        return {
            "success": True,
            "item": won_item,
            "item_price": item_price,
            "item_type": item_type,
            "item_rarity": item_rarity,
            "new_balance": user_data['points'],
            "inventory": user_data['inventory'],
            "message": f"Вы получили: {won_item}"
        }
        
    except HTTPException:
        raise
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
        
        logger.info(f"Пользователь {user_id} запрашивает ежедневный бонус")
        
        # Загружаем данные
        users = load_users()
        user_key = str(user_id)
        
        if user_key not in users:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        user_data = users[user_key]
        
        # Проверяем доступность бонуса
        if not check_daily_bonus_available(user_data):
            next_bonus = calculate_next_bonus_time(user_data)
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Бонус уже получен сегодня",
                    "next_available": next_bonus,
                    "next_available_human": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(next_bonus)) if next_bonus else None,
                    "message": "Возвращайтесь завтра!"
                }
            )
        
        # Начисляем бонус (от 50 до 150 баллов случайно)
        import random
        bonus_amount = random.randint(50, 150)
        user_data['points'] = user_data.get('points', 0) + bonus_amount
        user_data['last_daily_bonus'] = time.time()
        
        # Сохраняем изменения
        users[user_key] = user_data
        save_users(users)
        
        logger.info(f"Пользователь {user_id} получил бонус: {bonus_amount}")
        
        return {
            "success": True,
            "bonus": bonus_amount,
            "new_balance": user_data['points'],
            "next_available": calculate_next_bonus_time(user_data),
            "message": f"Ежедневный бонус: +{bonus_amount} баллов!"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения бонуса: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.post("/api/activate-promo")
async def activate_promo_code(
    data: ActivatePromoRequest,
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Активация промокода"""
    try:
        user_info = auth_data['user']
        user_id = user_info.get('id')
        promo_code = data.promo_code.upper().strip()
        
        if not promo_code:
            raise HTTPException(status_code=400, detail="Не указан промокод")
        
        logger.info(f"Пользователь {user_id} активирует промокод: {promo_code}")
        
        # Загружаем данные
        users = load_users()
        promo_codes = load_promo_codes()
        user_key = str(user_id)
        
        if user_key not in users:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        user_data = users[user_key]
        
        # Проверяем, использовал ли пользователь уже этот промокод
        if promo_code in user_data.get('used_promo_codes', []):
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Промокод уже использован",
                    "message": "Вы уже активировали этот промокод ранее"
                }
            )
        
        # Проверяем существование промокода
        if promo_code not in promo_codes:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Неверный промокод",
                    "message": "Такого промокода не существует"
                }
            )
        
        promo_data = promo_codes[promo_code]
        
        # Проверяем лимит использований
        if promo_data['max_uses'] != -1 and promo_data['uses'] >= promo_data['max_uses']:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Лимит использований исчерпан",
                    "message": "Этот промокод больше не действителен"
                }
            )
        
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
        
        logger.info(f"Пользователь {user_id} активировал промокод {promo_code} на {points} баллов")
        
        return {
            "success": True,
            "points": points,
            "new_balance": user_data['points'],
            "promo_code": promo_code,
            "description": promo_data.get('description', ''),
            "message": f"Промокод активирован! +{points} баллов"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка активации промокода: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.post("/api/withdraw-item")
async def withdraw_item(
    data: WithdrawItemRequest,
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Запрос на вывод предмета"""
    try:
        user_info = auth_data['user']
        user_id = user_info.get('id')
        item_index = data.item_index
        item_id = data.item_id
        
        if item_index is None and item_id is None:
            raise HTTPException(status_code=400, detail="Не указан предмет")
        
        logger.info(f"Пользователь {user_id} выводит предмет: index={item_index}, id={item_id}")
        
        # Загружаем данные
        users = load_users()
        user_key = str(user_id)
        
        if user_key not in users:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        user_data = users[user_key]
        inventory = user_data.get('inventory', [])
        
        # Находим предмет
        item = None
        item_idx = -1
        
        if item_id is not None:
            # Ищем по ID
            for i, inv_item in enumerate(inventory):
                if inv_item.get('id') == item_id:
                    item = inv_item
                    item_idx = i
                    break
        elif item_index is not None and 0 <= item_index < len(inventory):
            # Ищем по индексу
            item_idx = item_index
            item = inventory[item_idx]
        
        if not item:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Предмет не найден",
                    "message": "Предмет не найден в вашем инвентаре"
                }
            )
        
        # Проверяем трейд ссылку
        if not user_data.get('trade_link'):
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Не указана трейд ссылка",
                    "requires_trade_link": True,
                    "message": "Для вывода предметов необходимо указать трейд ссылку Steam"
                }
            )
        
        # Отправляем уведомление администратору (в лог)
        admin_notification = {
            "user_id": user_id,
            "username": user_data.get('username'),
            "item": item,
            "trade_link": user_data.get('trade_link'),
            "timestamp": time.time(),
            "type": "withdraw_request"
        }
        
        logger.info(f"Запрос на вывод предмета: {json.dumps(admin_notification, ensure_ascii=False)}")
        
        # Удаляем предмет из инвентаря
        user_data['inventory'].pop(item_idx)
        
        # Сохраняем изменения
        users[user_key] = user_data
        save_users(users)
        
        return {
            "success": True,
            "message": "Запрос отправлен администратору",
            "item": item['name'],
            "item_price": item.get('price', 0),
            "remaining_items": len(user_data['inventory']),
            "admin_notified": True,
            "notification_id": str(int(time.time() * 1000))
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка вывода предмета: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.post("/api/set-trade-link")
async def set_trade_link(
    data: SetTradeLinkRequest,
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Установка трейд ссылки"""
    try:
        user_info = auth_data['user']
        user_id = user_info.get('id')
        trade_link = data.trade_link.strip()
        
        if not trade_link:
            raise HTTPException(status_code=400, detail="Не указана трейд ссылка")
        
        logger.info(f"Пользователь {user_id} устанавливает трейд ссылку")
        
        # Простая валидация ссылки
        if not ("steamcommunity.com/tradeoffer/new/" in trade_link or 
                "steamcommunity.com/tradeoffer/" in trade_link):
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Неверный формат трейд ссылки",
                    "message": "Ссылка должна быть на Steam Community Trade Offer"
                }
            )
        
        # Загружаем данные
        users = load_users()
        user_key = str(user_id)
        
        if user_key not in users:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Обновляем трейд ссылку
        users[user_key]['trade_link'] = trade_link
        save_users(users)
        
        logger.info(f"Пользователь {user_id} сохранил трейд ссылку")
        
        return {
            "success": True,
            "message": "Трейд ссылка сохранена",
            "trade_link": trade_link,
            "validated": True
        }
        
    except HTTPException:
        raise
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
                    "description": data.get('description', ''),
                    "remaining_uses": data['max_uses'] - data['uses'] if data['max_uses'] != -1 else "∞",
                    "max_uses": data['max_uses'],
                    "used": data['uses']
                })
        
        return {
            "success": True,
            "promos": available_promos,
            "total": len(available_promos),
            "server_time": time.time()
        }
        
    except Exception as e:
        logger.error(f"Ошибка получения промокодов: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.get("/api/test")
async def test_endpoint():
    """Тестовый endpoint для проверки работы API"""
    try:
        users = load_users()
        promos = load_promo_codes()
        
        return {
            "success": True,
            "message": "API работает корректно",
            "timestamp": time.time(),
            "server_info": {
                "python_version": os.sys.version,
                "platform": os.sys.platform,
                "data_dir": str(DATA_DIR),
                "users_file_exists": USERS_FILE.exists(),
                "promo_file_exists": PROMO_CODES_FILE.exists(),
                "users_count": len(users),
                "promos_count": len(promos)
            },
            "endpoints": [
                "/api/health",
                "/api/user",
                "/api/open-case",
                "/api/daily-bonus",
                "/api/activate-promo",
                "/api/withdraw-item",
                "/api/set-trade-link",
                "/api/available-promos"
            ]
        }
    except Exception as e:
        logger.error(f"Ошибка тестового endpoint: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.get("/api/admin/stats")
async def admin_stats(auth_data: Dict[str, Any] = Depends(verify_telegram_auth)):
    """Статистика для администратора"""
    try:
        user_info = auth_data['user']
        user_id = user_info.get('id')
        
        # Проверяем, является ли пользователь администратором
        if user_id not in ADMIN_IDS:
            raise HTTPException(status_code=403, detail="Доступ запрещен")
        
        users = load_users()
        promos = load_promo_codes()
        
        # Считаем статистику
        total_balance = sum(user.get('points', 0) for user in users.values())
        total_inventory_items = sum(len(user.get('inventory', [])) for user in users.values())
        total_inventory_value = sum(
            sum(item.get('price', 0) for item in user.get('inventory', []))
            for user in users.values()
        )
        
        # Активные пользователи (за последние 7 дней)
        week_ago = time.time() - 7 * 86400
        active_users = sum(
            1 for user in users.values() 
            if user.get('last_active', 0) > week_ago
        )
        
        return {
            "success": True,
            "stats": {
                "total_users": len(users),
                "active_users_7d": active_users,
                "total_balance": total_balance,
                "total_inventory_items": total_inventory_items,
                "total_inventory_value": total_inventory_value,
                "promo_codes_total": len(promos),
                "promo_codes_used": sum(promo.get('uses', 0) for promo in promos.values()),
                "server_time": time.time()
            },
            "recent_users": [
                {
                    "id": user_id,
                    "username": user.get('username'),
                    "balance": user.get('points', 0),
                    "inventory": len(user.get('inventory', [])),
                    "created_at": user.get('created_at'),
                    "last_active": user.get('last_active')
                }
                for user_id, user in list(users.items())[:10]  # Последние 10 пользователей
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения статистики: {e}")
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

# Middleware для логирования
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    # Пропускаем health check из логов чтобы не засорять
    if request.url.path != "/api/health":
        logger.info(f"👉 {request.method} {request.url.path} - Client: {request.client.host if request.client else 'unknown'}")
    
    response = await call_next(request)
    process_time = time.time() - start_time
    
    if request.url.path != "/api/health":
        logger.info(f"👈 {request.method} {request.url.path} - {response.status_code} - {process_time:.3f}s")
    
    # Добавляем CORS заголовки
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    
    return response

# Обработчик OPTIONS запросов для CORS
@app.options("/{rest_of_path:path}")
async def preflight_handler(request: Request, rest_of_path: str):
    response = JSONResponse(content={"status": "ok"})
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Max-Age"] = "600"
    return response

# Инициализация при запуске
@app.on_event("startup")
async def startup_event():
    """Инициализация при запуске сервера"""
    logger.info("🚀 Запуск CS2 Bot API сервера...")
    
    # Проверяем создание директорий
    DATA_DIR.mkdir(exist_ok=True)
    
    # Инициализируем файлы если нужно
    users_count = len(load_users())
    promos_count = len(load_promo_codes())
    
    logger.info(f"📊 Инициализация завершена:")
    logger.info(f"   👥 Пользователей: {users_count}")
    logger.info(f"   🎫 Промокодов: {promos_count}")
    logger.info(f"   📁 Директория данных: {DATA_DIR}")
    logger.info(f"   🤖 Токен бота: {TOKEN[:8]}...{TOKEN[-4:] if len(TOKEN) > 12 else ''}")
    logger.info(f"   🔧 Админы: {ADMIN_IDS}")

# Точка входа для WSGI
if __name__ == "__main__":
    import uvicorn
    
    # Получаем порт из переменной окружения или используем 8000
    port = int(os.environ.get("PORT", 8000))
    
    logger.info(f"🌐 Запуск сервера на http://0.0.0.0:{port}")
    logger.info(f"📚 Документация: http://0.0.0.0:{port}/docs")
    logger.info(f"🔍 Тест API: http://0.0.0.0:{port}/api/test")
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=port,
        log_level="info",
        access_log=True
    )
