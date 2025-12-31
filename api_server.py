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
from pathlib import Path

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="CS2 Bot API", version="1.0.0")

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Разрешаем все origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

# Загрузка данных
def load_users() -> Dict[str, Any]:
    """Загружает пользователей из файла"""
    try:
        if USERS_FILE.exists():
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
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
                return data
    except Exception as e:
        logger.error(f"Ошибка загрузки промокодов: {e}")
    
    # Если файла нет, создаем дефолтные промокоды
    default_promos = {
        "WELCOME1": {"points": 100, "max_uses": -1, "uses": 0},
        "CS2FUN": {"points": 250, "max_uses": 100, "uses": 0},
        "RANWORK": {"points": 500, "max_uses": 50, "uses": 0},
        "START100": {"points": 100, "max_uses": -1, "uses": 0},
        "MINIAPP": {"points": 200, "max_uses": 200, "uses": 0}
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
    authorization: str = Header(None)
) -> Dict[str, Any]:
    """Проверяет аутентификацию через Telegram"""
    try:
        if not authorization:
            logger.warning("Отсутствует заголовок Authorization")
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
        
        return validated_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка проверки аутентификации: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера при проверке аутентификации")

# ===== API ENDPOINTS =====

@app.get("/")
async def root():
    return {
        "status": "online", 
        "service": "CS2 Bot API",
        "version": "1.0.0",
        "timestamp": time.time()
    }

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy", 
        "timestamp": time.time(),
        "users_count": len(load_users()),
        "promos_count": len(load_promo_codes())
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
                "referral_code": f"ref_{user_id}",
                "referred_by": None,
                "last_daily_bonus": None,
                "trade_link": None,
                "steam_collab": None,
                "telegram_collab": None,
                "created_at": time.time()
            }
            save_users(users)
            logger.info(f"Создан новый пользователь: {user_id}")
        
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
        
    except HTTPException:
        raise
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
        
        logger.info(f"Пользователь {user_id} открывает кейс за {case_price}")
        
        # Загружаем данные
        users = load_users()
        user_key = str(user_id)
        
        if user_key not in users:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        user_data = users[user_key]
        
        # Проверяем баланс
        if user_data.get('points', 0) < case_price:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Недостаточно баллов",
                    "required": case_price,
                    "current": user_data.get('points', 0)
                }
            )
        
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
        
        # Определяем тип предмета
        item_type = "other"
        if "Наклейка" in won_item:
            item_type = "sticker"
        elif any(weapon in won_item for weapon in ["FAMAS", "UMP", "Five-SeveN", "Капсула", "Брелок"]):
            item_type = "weapon"
        
        # Обновляем данные пользователя
        user_data['points'] = user_data.get('points', 0) - case_price
        user_data['inventory'].append({
            "id": str(int(time.time() * 1000)),
            "name": won_item,
            "price": item_price,
            "type": item_type,
            "received_at": time.time()
        })
        
        # Сохраняем изменения
        users[user_key] = user_data
        save_users(users)
        
        logger.info(f"Пользователь {user_id} выиграл: {won_item}")
        
        return {
            "success": True,
            "item": won_item,
            "item_price": item_price,
            "new_balance": user_data['points'],
            "inventory": user_data['inventory']
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
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Бонус уже получен сегодня",
                    "next_available": calculate_next_bonus_time(user_data)
                }
            )
        
        # Начисляем бонус
        bonus_amount = 50
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
            "next_available": calculate_next_bonus_time(user_data)
        }
        
    except HTTPException:
        raise
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
        promo_code = data.get('promo_code', '').upper().strip()
        
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
                    "error": "Промокод уже использован"
                }
            )
        
        # Проверяем существование промокода
        if promo_code not in promo_codes:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Неверный промокод"
                }
            )
        
        promo_data = promo_codes[promo_code]
        
        # Проверяем лимит использований
        if promo_data['max_uses'] != -1 and promo_data['uses'] >= promo_data['max_uses']:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Лимит использований исчерпан"
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
            "promo_code": promo_code
        }
        
    except HTTPException:
        raise
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
                    "error": "Предмет не найден"
                }
            )
        
        # Проверяем трейд ссылку
        if not user_data.get('trade_link'):
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Не указана трейд ссылка",
                    "requires_trade_link": True
                }
            )
        
        # Отправляем уведомление администратору (симуляция)
        admin_notification = {
            "user_id": user_id,
            "username": user_data.get('username'),
            "item": item,
            "trade_link": user_data.get('trade_link'),
            "timestamp": time.time(),
            "type": "single"
        }
        
        logger.info(f"Запрос на вывод предмета: {admin_notification}")
        
        # Удаляем предмет из инвентаря
        user_data['inventory'].pop(item_idx)
        
        # Сохраняем изменения
        users[user_key] = user_data
        save_users(users)
        
        return {
            "success": True,
            "message": "Запрос отправлен администратору",
            "item": item['name'],
            "remaining_items": len(user_data['inventory'])
        }
        
    except HTTPException:
        raise
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
        trade_link = data.get('trade_link', '').strip()
        
        if not trade_link:
            raise HTTPException(status_code=400, detail="Не указана трейд ссылка")
        
        logger.info(f"Пользователь {user_id} устанавливает трейд ссылку")
        
        # Простая валидация ссылки
        if "steamcommunity.com/tradeoffer/new/" not in trade_link:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Неверный формат трейд ссылки"
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
            "trade_link": trade_link
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
                    "remaining_uses": data['max_uses'] - data['uses'] if data['max_uses'] != -1 else "∞"
                })
        
        return {
            "success": True,
            "promos": available_promos
        }
        
    except Exception as e:
        logger.error(f"Ошибка получения промокодов: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.get("/api/test")
async def test_endpoint():
    """Тестовый endpoint для проверки работы API"""
    return {
        "success": True,
        "message": "API работает корректно",
        "timestamp": time.time(),
        "users_file_exists": USERS_FILE.exists(),
        "promo_file_exists": PROMO_CODES_FILE.exists(),
        "data_dir": str(DATA_DIR)
    }

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
    response = await call_next(request)
    process_time = time.time() - start_time
    logger.info(f"{request.method} {request.url.path} - {response.status_code} - {process_time:.3f}s")
    return response

if __name__ == "__main__":
    import uvicorn
    
    # Проверяем создание директорий
    DATA_DIR.mkdir(exist_ok=True)
    
    # Инициализируем файлы если нужно
    load_users()
    load_promo_codes()
    
    logger.info(f"Запуск API сервера на порту 8000")
    logger.info(f"Токен бота: {TOKEN[:10]}...")
    logger.info(f"Директория данных: {DATA_DIR}")
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_level="info"
    )
