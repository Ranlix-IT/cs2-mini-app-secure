# app.py - CS2 Bot API Server с базой данных и OAuth авторизацией
from fastapi import FastAPI, HTTPException, Depends, Header, Request, BackgroundTasks, Response, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
import json
import logging
import asyncio
from typing import Dict, Any, Optional, List
import hashlib
import hmac
import time
import os
from pathlib import Path
from pydantic import BaseModel
import random
from datetime import datetime, timedelta
import secrets
import jwt
import datetime as dt

# Импортируем базу данных
from database import db

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="CS2 Bot API",
    version="2.0.2",  # Обновленная версия с OAuth
    docs_url="/docs",
    redoc_url="/redoc"
)

# Конфигурация бота
TOKEN = "7836761722:AAGzXQjiYuX_MOM9ZpMvrVtBx3175giOprQ"
ADMIN_IDS = [1003215844]
REQUIRED_CHANNEL = "@ranworkcs"
SECRET_KEY = "your-secret-key-here-change-in-production"  # В продакшене используйте переменные окружения
API_BASE_URL = "https://cs2-mini-app.onrender.com"

BASE_DIR = Path(__file__).resolve().parent

# Хранилище для временных OAuth state
temp_auth_storage = {}

# Настройка CORS для Telegram Mini Apps
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

# Модели данных
class OpenCaseRequest(BaseModel):
    price: int
    case_id: Optional[int] = None

class ActivatePromoRequest(BaseModel):
    promo_code: str

class WithdrawItemRequest(BaseModel):
    item_id: int

class SetTradeLinkRequest(BaseModel):
    trade_link: str

class CheckTelegramProfileRequest(BaseModel):
    last_name: Optional[str] = None
    bio: Optional[str] = None

class CheckSteamProfileRequest(BaseModel):
    steam_url: str

class InviteFriendRequest(BaseModel):
    referral_code: str

class UpdateRequest(BaseModel):
    force: bool = False

# ===== ОБРАБОТЧИКИ СТАТИЧЕСКИХ ФАЙЛОВ С АНТИКЕШИРОВАНИЕМ =====
@app.get("/")
async def serve_root(request: Request):
    """Главная HTML страница"""
    try:
        index_path = BASE_DIR / "index.html"
        if index_path.exists():
            with open(index_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            # Добавляем версию в теги для обновления кеша
            html_content = html_content.replace(
                'href="/style.css"',
                f'href="/style.css?v={int(time.time())}"'
            ).replace(
                'src="/script.js"',
                f'src="/script.js?v={int(time.time())}"'
            )
            
            response = HTMLResponse(content=html_content)
            # Заголовки против кеширования
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
            response.headers["ETag"] = f'"{hashlib.md5(str(time.time()).encode()).hexdigest()}"'
            return response
        else:
            return HTMLResponse(content="""
                <!DOCTYPE html>
                <html>
                <head><title>CS2 Bot API</title></head>
                <body>
                    <h1>CS2 Bot API v2.0.2</h1>
                    <p>API сервер работает нормально</p>
                    <p><a href="/docs">Документация API</a></p>
                </body>
                </html>
            """)
    except Exception as e:
        logger.error(f"Ошибка загрузки index.html: {e}")
        raise HTTPException(status_code=500, detail="Ошибка загрузки страницы")

@app.get("/style.css")
async def serve_css():
    """Отдача CSS файла с антикешированием"""
    css_path = BASE_DIR / "style.css"
    if css_path.exists():
        response = FileResponse(css_path, media_type="text/css")
        response.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"
        response.headers["ETag"] = f'"{hashlib.md5(str(os.path.getmtime(css_path)).encode()).hexdigest()}"'
        return response
    raise HTTPException(status_code=404, detail="CSS файл не найден")

@app.get("/script.js")
async def serve_js():
    """Отдача JavaScript файла с антикешированием"""
    js_path = BASE_DIR / "script.js"
    if js_path.exists():
        response = FileResponse(js_path, media_type="application/javascript")
        response.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"
        response.headers["ETag"] = f'"{hashlib.md5(str(os.path.getmtime(js_path)).encode()).hexdigest()}"'
        return response
    raise HTTPException(status_code=404, detail="JS файл не найден")

@app.get("/manifest.json")
async def serve_manifest():
    """Отдача manifest.json"""
    manifest_path = BASE_DIR / "manifest.json"
    if manifest_path.exists():
        return FileResponse(manifest_path, media_type="application/json")
    raise HTTPException(status_code=404, detail="Manifest файл не найден")

@app.get("/service-worker.js")
async def serve_service_worker():
    """Отдача Service Worker"""
    sw_path = BASE_DIR / "service-worker.js"
    if sw_path.exists():
        response = FileResponse(sw_path, media_type="application/javascript")
        response.headers["Cache-Control"] = "no-cache, max-age=0"
        return response
    raise HTTPException(status_code=404, detail="Service Worker не найден")

# ===== OAuth АВТОРИЗАЦИЯ =====
@app.get("/api/auth/telegram")
async def telegram_auth_redirect():
    """Перенаправление на OAuth Telegram"""
    # Генерируем случайный state для защиты от CSRF
    state = secrets.token_urlsafe(32)
    
    # Сохраняем state во временное хранилище
    temp_auth_storage[state] = {
        "timestamp": time.time(),
        "used": False
    }
    
    # URL OAuth Telegram
    telegram_auth_url = f"https://oauth.telegram.org/auth?bot_id=7836761722&origin={API_BASE_URL}&request_access=write&state={state}"
    
    return RedirectResponse(url=telegram_auth_url)

@app.get("/api/auth/telegram-callback")
async def telegram_auth_callback(
    request: Request,
    id: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    username: Optional[str] = None,
    photo_url: Optional[str] = None,
    auth_date: Optional[str] = None,
    hash: Optional[str] = None,
    state: Optional[str] = None
):
    """Обработка callback от Telegram OAuth"""
    try:
        logger.info(f"Telegram OAuth callback: id={id}, username={username}")
        
        # Проверяем state
        if not state or state not in temp_auth_storage:
            raise HTTPException(status_code=400, detail="Invalid state parameter")
        
        # Проверяем, что state не использовался
        if temp_auth_storage[state].get("used", False):
            raise HTTPException(status_code=400, detail="State already used")
        
        # Отмечаем state как использованный
        temp_auth_storage[state]["used"] = True
        
        # Проверяем обязательные параметры
        if not id or not auth_date or not hash:
            raise HTTPException(status_code=400, detail="Missing required parameters")
        
        # Проверка подписи
        check_string = f'auth_date={auth_date}\nfirst_name={first_name or ""}\nid={id}\nlast_name={last_name or ""}\nphoto_url={photo_url or ""}\nusername={username or ""}'
        
        secret_key = hashlib.sha256(TOKEN.encode()).digest()
        hmac_hash = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()
        
        if hmac_hash != hash:
            logger.warning(f"Invalid hash: expected {hmac_hash}, got {hash}")
            raise HTTPException(status_code=400, detail="Invalid hash")
        
        # Создаем или получаем пользователя
        user_id = int(id)
        
        # Получаем или создаем пользователя в базе данных
        user = db.get_or_create_user(
            telegram_id=user_id,
            username=username,
            first_name=first_name,
            last_name=last_name
        )
        
        if not user:
            raise HTTPException(status_code=500, detail="Failed to create user")
        
        # Создаем JWT токен
        token_payload = {
            "sub": str(user_id),
            "user_id": user['id'],
            "telegram_id": user_id,
            "username": username,
            "first_name": first_name,
            "last_name": last_name,
            "exp": dt.datetime.utcnow() + dt.timedelta(days=30)
        }
        
        token = jwt.encode(token_payload, SECRET_KEY, algorithm="HS256")
        
        # Создаем response с редиректом и установкой cookie
        response = RedirectResponse(url="/")
        
        # Устанавливаем HTTP-only cookie
        response.set_cookie(
            key="auth_token",
            value=token,
            httponly=True,
            max_age=30*24*3600,  # 30 дней
            samesite="lax",
            secure=True,  # Только для HTTPS
            path="/"
        )
        
        # Также устанавливаем cookie для клиентского доступа (без sensitive данных)
        user_data_cookie = {
            "id": user_id,
            "username": username,
            "first_name": first_name,
            "last_name": last_name
        }
        
        response.set_cookie(
            key="user_data",
            value=json.dumps(user_data_cookie),
            max_age=30*24*3600,
            samesite="lax",
            secure=True,
            path="/"
        )
        
        logger.info(f"User authenticated via OAuth: {user_id} ({username})")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        raise HTTPException(status_code=500, detail="Authentication failed")

@app.get("/api/auth/logout")
async def logout(response: Response):
    """Выход из системы"""
    response.delete_cookie(key="auth_token")
    response.delete_cookie(key="user_data")
    return {"success": True, "message": "Logged out"}

# ===== API ДЛЯ ОБНОВЛЕНИЙ =====
@app.get("/api/version")
async def get_version():
    """Возвращает версию приложения"""
    return {
        "version": "2.0.2",
        "build_date": datetime.now().isoformat(),
        "features": ["auto_update", "cache_control", "enhanced_earn", "oauth_auth"],
        "requires_refresh": False,
        "telegram_bot": "@rancasebot"
    }

@app.post("/api/clear-cache")
async def clear_cache(request: UpdateRequest):
    """Очистка кеша"""
    return {
        "success": True,
        "message": "Кеш будет очищен при следующей загрузке",
        "timestamp": time.time(),
        "force_refresh": request.force,
        "next_version": "2.0.2"
    }

@app.get("/api/check-update")
async def check_update():
    """Проверка обновлений"""
    return {
        "update_available": False,
        "current_version": "2.0.2",
        "latest_version": "2.0.2",
        "changelog": "Добавлена OAuth авторизация через Telegram Widget",
        "priority": "medium"
    }

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
    """Проверяет аутентификацию через Telegram (Mini App, OAuth cookie)"""
    try:
        # 1. Проверяем JWT токен из cookie (веб-авторизация)
        auth_token = request.cookies.get("auth_token")
        if auth_token:
            try:
                decoded = jwt.decode(auth_token, SECRET_KEY, algorithms=["HS256"])
                
                logger.info(f"JWT auth valid for user: {decoded.get('telegram_id')}")
                
                return {
                    'user': {
                        'id': decoded.get('telegram_id'),
                        'first_name': decoded.get('first_name'),
                        'last_name': decoded.get('last_name'),
                        'username': decoded.get('username')
                    },
                    'user_id': decoded.get('user_id'),
                    'valid': True,
                    'auth_method': 'cookie'
                }
            except jwt.ExpiredSignatureError:
                logger.warning("JWT token expired")
            except jwt.InvalidTokenError as e:
                logger.error(f"Invalid JWT token: {e}")
            except Exception as e:
                logger.error(f"JWT decode error: {e}")
        
        logger.info(f"Запрос на аутентификацию: {request.url.path}")
        
        # 2. Проверяем Telegram Mini App авторизацию
        if not authorization:
            logger.warning("Отсутствует заголовок Authorization")
            if request.url.path in ["/api/health", "/api/available-promos", "/api/test", "/", "/script.js", "/style.css", "/manifest.json", "/service-worker.js", "/api/version", "/api/check-update", "/api/can-use-referral", "/api/auth/logout"]:
                # Разрешаем доступ к публичным endpoint
                return {
                    'user': {'id': 1003215844, 'first_name': 'Test', 'username': 'test'}, 
                    'valid': True,
                    'demo_mode': True
                }
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
        validated_data['demo_mode'] = False
        validated_data['auth_method'] = 'mini_app'
        return validated_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка проверки аутентификации: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера при проверке аутентификации")

# ===== API ENDPOINTS =====

@app.get("/api/health")
async def health_check():
    """Проверка здоровья API"""
    try:
        # Проверяем подключение к базе данных
        import sqlite3
        conn = sqlite3.connect("data/cs2_bot.db", check_same_thread=False)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users")
        user_count = cursor.fetchone()[0]
        conn.close()
        
        return {
            "status": "healthy", 
            "service": "CS2 Bot API v2.0.2",
            "version": "2.0.2",
            "timestamp": time.time(),
            "database": "SQLite",
            "users_count": user_count,
            "telegram_bot": "connected" if TOKEN else "disconnected",
            "debug_mode": os.environ.get('DEBUG_MODE', 'True'),
            "auto_update": True,
            "cache_version": int(time.time())
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": time.time()
        }

@app.get("/api/can-use-referral")
async def check_can_use_referral(auth_data: Dict[str, Any] = Depends(verify_telegram_auth)):
    """Проверяет, может ли пользователь ввести реферальный код"""
    try:
        user_info = auth_data['user']
        demo_mode = auth_data.get('demo_mode', False)
        user_id = user_info.get('id')
        
        if not user_id:
            raise HTTPException(status_code=400, detail="ID пользователя не найден")
        
        if demo_mode:
            # В демо-режиме всегда можно использовать в течение 5 минут
            demo_time_left = 300  # 5 минут
            return {
                "success": True,
                "can_use": True,
                "time_left": demo_time_left,
                "minutes_left": demo_time_left / 60,
                "message": "Вы можете ввести реферальный код",
                "demo_mode": True
            }
        
        # Получаем пользователя
        user = db.get_user(telegram_id=user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Используем метод из базы данных для проверки
        result = db.can_use_referral_code(user['id'])
        
        return {
            "success": True,
            "can_use": result["can_use"],
            "time_left": result.get("time_left", 0),
            "minutes_left": result.get("minutes_left", 0),
            "message": result.get("reason", ""),
            "created_at": result.get("created_at")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка проверки возможности ввода кода: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.get("/api/user")
async def get_user_data(auth_data: Dict[str, Any] = Depends(verify_telegram_auth)):
    """Получение данных пользователя"""
    try:
        user_info = auth_data['user']
        demo_mode = auth_data.get('demo_mode', False)
        auth_method = auth_data.get('auth_method', 'unknown')
        user_id = user_info.get('id')
        
        if not user_id:
            raise HTTPException(status_code=400, detail="ID пользователя не найден")
        
        if demo_mode:
            return await get_demo_user_data(user_info)
        
        # Получаем или создаем пользователя в базе данных
        user = db.get_or_create_user(
            telegram_id=user_id,
            username=user_info.get('username'),
            first_name=user_info.get('first_name'),
            last_name=user_info.get('last_name')
        )
        
        if not user:
            raise HTTPException(status_code=500, detail="Ошибка создания пользователя")
        
        # Получаем статистику
        stats = db.get_user_stats(user['id'])
        
        # Получаем инвентарь
        inventory = db.get_inventory(user['id'])
        
        # Получаем реферальную информацию
        referral_info = db.get_referral_info(user['id'])
        
        # Проверяем ежедневный бонус
        daily_bonus_available = check_daily_bonus_available(user['id'])
        
        response = {
            "success": True,
            "user": {
                "id": user['id'],
                "telegram_id": user['telegram_id'],
                "username": user['username'],
                "first_name": user['first_name'],
                "last_name": user['last_name'],
                "balance": user['points'],
                "referral_code": user['referral_code'],
                "trade_link": user['trade_link'],
                "created_at": user['created_at'],
                "is_subscribed": bool(user['is_subscribed']),
                "auth_method": auth_method
            },
            "stats": {
                "total_earned": stats.get('total_earned', 0),
                "referral_earnings": stats.get('referral_earnings', 0),
                "telegram_earnings": stats.get('telegram_earnings', 0),
                "steam_earnings": stats.get('steam_earnings', 0),
                "total_cases_opened": stats.get('total_cases_opened', 0),
                "total_spent": stats.get('total_spent', 0),
                "inventory_count": stats.get('inventory_count', 0),
                "inventory_value": stats.get('inventory_value', 0)
            },
            "referral_info": referral_info,
            "inventory": inventory,
            "daily_bonus_available": daily_bonus_available,
            "daily_streak": stats.get('daily_streak', 0),
            "telegram_profile_verified": bool(stats.get('telegram_verified')),
            "steam_profile_verified": bool(stats.get('steam_verified')),
            "server_time": time.time(),
            "cache_version": int(time.time() / 3600)  # Меняется каждый час
        }
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения данных пользователя: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

async def get_demo_user_data(user_info: Dict[str, Any]) -> Dict[str, Any]:
    """Возвращает демо данные пользователя"""
    return {
        "success": True,
        "user": {
            "id": 1,
            "telegram_id": user_info.get('id', 1003215844),
            "username": user_info.get('username', 'demo_user'),
            "first_name": user_info.get('first_name', 'Демо'),
            "last_name": user_info.get('last_name', 'Пользователь'),
            "balance": 1500,
            "referral_code": f"ref_{user_info.get('id', 1003215844)}",
            "trade_link": "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=abc123",
            "created_at": time.time() - 86400,
            "is_subscribed": True,
            "auth_method": "demo"
        },
        "stats": {
            "total_earned": 2000,
            "referral_earnings": 500,
            "telegram_earnings": 500,
            "steam_earnings": 1000,
            "total_cases_opened": 10,
            "total_spent": 5000,
            "inventory_count": 3,
            "inventory_value": 1500
        },
        "referral_info": {
            "total_referrals": 3,
            "active_referrals": 3,
            "referral_code": f"ref_{user_info.get('id', 1003215844)}",
            "referral_link": f"https://t.me/rancasebot?start=ref_{user_info.get('id', 1003215844)}"
        },
        "inventory": [
            {
                "id": 1,
                "item_name": "Наклейка | ENCE |",
                "item_type": "sticker",
                "item_rarity": "common",
                "item_price": 250,
                "created_at": time.time() - 86400
            },
            {
                "id": 2,
                "item_name": "FAMAS | Колония",
                "item_type": "weapon",
                "item_rarity": "uncommon",
                "item_price": 500,
                "created_at": time.time() - 43200
            },
            {
                "id": 3,
                "item_name": "Five-SeveN | Хладагент",
                "item_type": "weapon",
                "item_rarity": "rare",
                "item_price": 750,
                "created_at": time.time() - 21600
            }
        ],
        "daily_bonus_available": True,
        "daily_streak": 3,
        "telegram_profile_verified": True,
        "steam_profile_verified": True,
        "server_time": time.time(),
        "demo_mode": True,
        "cache_version": int(time.time() / 3600)
    }

@app.post("/api/open-case")
async def open_case(
    data: OpenCaseRequest,
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Открытие кейса"""
    try:
        user_info = auth_data['user']
        demo_mode = auth_data.get('demo_mode', False)
        user_id = user_info.get('id')
        case_price = data.price
        
        if not case_price or case_price <= 0:
            raise HTTPException(status_code=400, detail="Неверная цена кейса")
        
        if demo_mode:
            return await open_case_demo(user_info, case_price)
        
        # Получаем пользователя
        user = db.get_user(telegram_id=user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Проверяем баланс
        if user['points'] < case_price:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Недостаточно баллов",
                    "required": case_price,
                    "current": user['points'],
                    "message": "Пополните баланс или выполните задания"
                }
            )
        
        # Получаем случайный предмет из кейса
        won_item = get_random_item_from_case(case_price)
        
        # Списываем баллы
        if not db.update_user_balance(
            user['id'], 
            -case_price, 
            "open_case",
            json.dumps({"case_price": case_price, "item": won_item['name']})
        ):
            raise HTTPException(status_code=500, detail="Ошибка списания баллов")
        
        # Добавляем предмет в инвентарь
        item_id = db.add_to_inventory(user['id'], won_item)
        
        # Получаем обновленные данные
        user = db.get_user(user_id=user['id'])
        inventory = db.get_inventory(user['id'])
        
        response = {
            "success": True,
            "item": won_item['name'],
            "item_data": won_item,
            "item_id": item_id,
            "new_balance": user['points'],
            "inventory": inventory,
            "message": f"Вы получили: {won_item['name']}"
        }
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка открытия кейса: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

async def open_case_demo(user_info: Dict[str, Any], case_price: int) -> Dict[str, Any]:
    """Демо режим открытия кейса"""
    items_db = {
        500: [
            {"name": "Наклейка | ENCE |", "type": "sticker", "rarity": "common", "price": 250},
            {"name": "Наклейка | Grayhound", "type": "sticker", "rarity": "common", "price": 200},
            {"name": "Наклейка | PGL |", "type": "sticker", "rarity": "common", "price": 300}
        ],
        3000: [
            {"name": "Наклейка | huNter |", "type": "sticker", "rarity": "uncommon", "price": 500},
            {"name": "FAMAS | Колония", "type": "weapon", "rarity": "uncommon", "price": 800},
            {"name": "UMP-45 | Внедорожник", "type": "weapon", "rarity": "uncommon", "price": 700}
        ]
    }
    
    import random
    available_items = items_db.get(case_price, items_db[500])
    won_item = random.choice(available_items)
    
    return {
        "success": True,
        "item": won_item['name'],
        "item_data": won_item,
        "item_id": random.randint(1000, 9999),
        "new_balance": 1000,
        "inventory": [
            {
                "id": 1,
                "item_name": won_item['name'],
                "item_type": won_item['type'],
                "item_rarity": won_item['rarity'],
                "item_price": won_item['price'],
                "created_at": time.time()
            }
        ],
        "message": f"Вы получили: {won_item['name']}",
        "demo_mode": True
    }

def get_random_item_from_case(case_price: int) -> Dict[str, Any]:
    """Возвращает случайный предмет из кейса"""
    items_db = {
        500: [
            {"name": "Наклейка | ENCE |", "type": "sticker", "rarity": "common", "price": 250},
            {"name": "Наклейка | Grayhound", "type": "sticker", "rarity": "common", "price": 200},
            {"name": "Наклейка | PGL |", "type": "sticker", "rarity": "common", "price": 300}
        ],
        3000: [
            {"name": "Наклейка | huNter |", "type": "sticker", "rarity": "uncommon", "price": 500},
            {"name": "FAMAS | Колония", "type": "weapon", "rarity": "uncommon", "price": 800},
            {"name": "UMP-45 | Внедорожник", "type": "weapon", "rarity": "uncommon", "price": 700}
        ],
        5000: [
            {"name": "Five-SeveN | Хладагент", "type": "weapon", "rarity": "rare", "price": 1500},
            {"name": "Капсула с наклейками", "type": "case", "rarity": "rare", "price": 2000},
            {"name": "Sticker | XD", "type": "sticker", "rarity": "rare", "price": 1000}
        ],
        10000: [
            {"name": "Наклейка | Клоунский парик", "type": "sticker", "rarity": "epic", "price": 3000},
            {"name": "Наклейка | Высокий полёт", "type": "sticker", "rarity": "epic", "price": 3500},
            {"name": "Sticker | From The Deep", "type": "sticker", "rarity": "epic", "price": 4000}
        ],
        15000: [
            {"name": "Наклейка | Гипноглаза", "type": "sticker", "rarity": "legendary", "price": 6000},
            {"name": "Наклейка | Радужный путь", "type": "sticker", "rarity": "legendary", "price": 7000},
            {"name": "Брелок | Щепотка соли", "type": "collectible", "rarity": "legendary", "price": 8000}
        ]
    }
    
    available_items = items_db.get(case_price, items_db[500])
    import random
    won_item = random.choice(available_items)
    
    # Добавляем цену кейса
    won_item['case_price'] = case_price
    
    # Генерируем ссылку на Steam Market
    won_item['steam_market_link'] = f"https://steamcommunity.com/market/listings/730/{won_item['name'].replace(' ', '%20')}"
    
    return won_item

@app.post("/api/daily-bonus")
async def claim_daily_bonus(
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Получение ежедневного бонуса"""
    try:
        user_info = auth_data['user']
        demo_mode = auth_data.get('demo_mode', False)
        user_id = user_info.get('id')
        
        if demo_mode:
            return await claim_daily_bonus_demo()
        
        # Получаем пользователя
        user = db.get_user(telegram_id=user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Проверяем доступность бонуса
        if not check_daily_bonus_available(user['id']):
            next_bonus = get_next_bonus_time(user['id'])
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Бонус уже получен сегодня",
                    "next_available": next_bonus,
                    "message": "Возвращайтесь завтра!"
                }
            )
        
        # Рассчитываем бонус (от 50 до 150 + стрик)
        import random
        base_bonus = random.randint(50, 150)
        streak = get_daily_streak(user['id'])
        streak_bonus = min(streak * 10, 100)  # Максимум +100 за стрик
        total_bonus = base_bonus + streak_bonus
        
        # Начисляем бонус
        if not db.update_user_balance(
            user['id'], 
            total_bonus, 
            "daily_bonus",
            json.dumps({"base": base_bonus, "streak": streak, "streak_bonus": streak_bonus})
        ):
            raise HTTPException(status_code=500, detail="Ошибка начисления бонуса")
        
        # Записываем получение бонуса
        record_daily_bonus(user['id'], total_bonus, streak + 1)
        
        # Получаем обновленные данные
        user = db.get_user(user_id=user['id'])
        
        response = {
            "success": True,
            "bonus": total_bonus,
            "base_bonus": base_bonus,
            "streak": streak + 1,
            "streak_bonus": streak_bonus,
            "new_balance": user['points'],
            "next_available": get_next_bonus_time(user['id']),
            "message": f"Ежедневный бонус: +{total_bonus} баллов! (стрик: {streak + 1})"
        }
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения бонусов: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

async def claim_daily_bonus_demo() -> Dict[str, Any]:
    """Демо режим ежедневного бонуса"""
    import random
    bonus = random.randint(50, 150)
    
    return {
        "success": True,
        "bonus": bonus,
        "base_bonus": bonus,
        "streak": 1,
        "streak_bonus": 0,
        "new_balance": 1500,
        "next_available": time.time() + 86400,
        "message": f"Ежедневный бонус: +{bonus} баллов!",
        "demo_mode": True
    }

@app.post("/api/activate-promo")
async def activate_promo_code(
    data: ActivatePromoRequest,
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Активация промокода"""
    try:
        user_info = auth_data['user']
        demo_mode = auth_data.get('demo_mode', False)
        user_id = user_info.get('id')
        promo_code = data.promo_code.upper().strip()
        
        if not promo_code:
            raise HTTPException(status_code=400, detail="Не указан промокод")
        
        if demo_mode:
            return await activate_promo_demo(promo_code)
        
        # Получаем пользователя
        user = db.get_user(telegram_id=user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Проверяем промокод в базе данных
        conn = db.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT pc.*, 
            (SELECT COUNT(*) FROM used_promo_codes upc 
             WHERE upc.promo_code_id = pc.id AND upc.user_id = ?) as already_used
            FROM promo_codes pc
            WHERE pc.code = ? AND pc.is_active = 1 
            AND (pc.expires_at IS NULL OR pc.expires_at > CURRENT_TIMESTAMP)
        ''', (user['id'], promo_code))
        
        promo = cursor.fetchone()
        
        if not promo:
            conn.close()
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Неверный промокод",
                    "message": "Такого промокода не существует или он неактивен"
                }
            )
        
        if promo['already_used'] > 0:
            conn.close()
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Промокод уже использован",
                    "message": "Вы уже активировали этот промокод ранее"
                }
            )
        
        if promo['max_uses'] != -1 and promo['used_count'] >= promo['max_uses']:
            conn.close()
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Лимит использований исчерпан",
                    "message": "Этот промокод больше не действителен"
                }
            )
        
        # Начисляем баллы
        if not db.update_user_balance(
            user['id'], 
            promo['points'], 
            "promo_code",
            json.dumps({"promo_code": promo_code})
        ):
            conn.close()
            raise HTTPException(status_code=500, detail="Ошибка начисления баллов")
        
        # Отмечаем промокод как использованный
        cursor.execute('''
            INSERT INTO used_promo_codes (user_id, promo_code_id)
            VALUES (?, ?)
        ''', (user['id'], promo['id']))
        
        # Обновляем счетчик использований
        cursor.execute('''
            UPDATE promo_codes SET used_count = used_count + 1
            WHERE id = ?
        ''', (promo['id'],))
        
        conn.commit()
        conn.close()
        
        # Получаем обновленные данные
        user = db.get_user(user_id=user['id'])
        
        response = {
            "success": True,
            "points": promo['points'],
            "new_balance": user['points'],
            "promo_code": promo_code,
            "description": promo['description'],
            "message": f"Промокод активирован! +{promo['points']} баллов"
        }
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка активации промокода: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

async def activate_promo_demo(promo_code: str) -> Dict[str, Any]:
    """Демо режим активации промокода"""
    promo_points = {
        'WELCOME1': 100,
        'CS2FUN': 250,
        'RANWORK': 500,
        'START100': 100,
        'MINIAPP': 200
    }
    
    if promo_code in promo_points:
        return {
            "success": True,
            "points": promo_points[promo_code],
            "new_balance": 1500 + promo_points[promo_code],
            "promo_code": promo_code,
            "description": "Демо промокод",
            "message": f"Промокод активирован! +{promo_points[promo_code]} баллов",
            "demo_mode": True
        }
    else:
        return {
            "success": False,
            "error": "Неверный промокод",
            "message": "Такого промокода не существует",
            "demo_mode": True
        }

@app.post("/api/withdraw-item")
async def withdraw_item(
    data: WithdrawItemRequest,
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Запрос на вывод предмета"""
    try:
        user_info = auth_data['user']
        demo_mode = auth_data.get('demo_mode', False)
        user_id = user_info.get('id')
        
        if demo_mode:
            return await withdraw_item_demo(data.item_id)
        
        # Получаем пользователя
        user = db.get_user(telegram_id=user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Проверяем трейд ссылку
        if not user['trade_link']:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Не указана трейд ссылка",
                    "requires_trade_link": True,
                    "message": "Для вывода предметов необходимо указать трейд ссылку Steam"
                }
            )
        
        # Создаем запрос на вывод
        if not db.create_withdrawal_request(user['id'], data.item_id, user['trade_link']):
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Не удалось создать запрос на вывод",
                    "message": "Предмет не найден или уже выводится"
                }
            )
        
        # Логируем действие
        db.update_user_balance(
            user['id'], 
            0, 
            "withdrawal_request",
            json.dumps({"item_id": data.item_id})
        )
        
        response = {
            "success": True,
            "message": "Запрос на вывод отправлен администратору",
            "admin_notified": True,
            "notification_id": str(int(time.time() * 1000))
        }
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка вывода предмета: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

async def withdraw_item_demo(item_id: int) -> Dict[str, Any]:
    """Демо режим вывода предмета"""
    return {
        "success": True,
        "message": "Демо: запрос на вывод отправлен",
        "admin_notified": False,
        "notification_id": str(int(time.time() * 1000)),
        "demo_mode": True
    }

@app.post("/api/set-trade-link")
async def set_trade_link(
    data: SetTradeLinkRequest,
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Установка трейд ссылки"""
    try:
        user_info = auth_data['user']
        demo_mode = auth_data.get('demo_mode', False)
        user_id = user_info.get('id')
        trade_link = data.trade_link.strip()
        
        if not trade_link:
            raise HTTPException(status_code=400, detail="Не указана трейд ссылка")
        
        # Валидируем трейд ссылку
        validation = db.validate_trade_link(trade_link)
        if not validation["valid"]:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Неверный формат трейд ссылки",
                    "message": validation["message"]
                }
            )
        
        if demo_mode:
            return {
                "success": True,
                "message": "Трейд ссылка сохранена (демо)",
                "trade_link": trade_link,
                "validated": True,
                "demo_mode": True
            }
        
        # Получаем пользователя
        user = db.get_user(telegram_id=user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Обновляем трейд ссылку
        conn = db.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE users SET trade_link = ? WHERE id = ?
        ''', (trade_link, user['id']))
        
        conn.commit()
        conn.close()
        
        response = {
            "success": True,
            "message": "Трейд ссылка сохранена",
            "trade_link": trade_link,
            "validated": True,
            "steam_id": validation.get("steam_id")
        }
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка сохранения трейд ссылки: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.post("/api/earn/check-telegram")
async def check_telegram_profile(
    data: CheckTelegramProfileRequest,
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Проверка Telegram профиля"""
    try:
        user_info = auth_data['user']
        demo_mode = auth_data.get('demo_mode', False)
        user_id = user_info.get('id')
        
        if demo_mode:
            return await check_telegram_profile_demo()
        
        # Получаем пользователя
        user = db.get_user(telegram_id=user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Проверяем профиль
        result = db.check_telegram_profile(
            user['id'],
            data.last_name,
            data.bio
        )
        
        # Получаем обновленные данные
        stats = db.get_user_stats(user['id'])
        
        response = {
            "success": True,
            "verified": result["verified"],
            "has_bot_in_lastname": result["has_bot_in_lastname"],
            "has_bot_in_bio": result["has_bot_in_bio"],
            "first_verification": result["first_verification"],
            "telegram_earnings": stats.get("telegram_earnings", 0),
            "message": "Telegram профиль проверен" if result["verified"] else "Добавьте бота в профиль Telegram"
        }
        
        if result["first_verification"]:
            response["bonus_awarded"] = 500
            response["message"] = "Telegram профиль подтвержден! +500 баллов"
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка проверки Telegram профиля: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

async def check_telegram_profile_demo() -> Dict[str, Any]:
    """Демо режим проверки Telegram профиля"""
    return {
        "success": True,
        "verified": True,
        "has_bot_in_lastname": True,
        "has_bot_in_bio": True,
        "first_verification": False,
        "telegram_earnings": 500,
        "message": "Telegram профиль проверен",
        "demo_mode": True
    }

@app.post("/api/earn/check-steam")
async def check_steam_profile(
    data: CheckSteamProfileRequest,
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Проверка Steam профиля"""
    try:
        user_info = auth_data['user']
        demo_mode = auth_data.get('demo_mode', False)
        user_id = user_info.get('id')
        steam_url = data.steam_url
        
        if not steam_url:
            raise HTTPException(status_code=400, detail="Не указана ссылка на Steam профиль")
        
        if demo_mode:
            return await check_steam_profile_demo()
        
        # Получаем пользователя
        user = db.get_user(telegram_id=user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Проверяем профиль
        result = db.check_steam_profile(user['id'], steam_url)
        
        if "error" in result:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": result["error"],
                    "message": "Неверный Steam URL"
                }
            )
        
        # Получаем обновленные данные
        stats = db.get_user_stats(user['id'])
        
        response = {
            "success": True,
            "verified": result["verified"],
            "steam_id": result["steam_id"],
            "level": result["level"],
            "games": result["games"],
            "badges": result["badges"],
            "age_days": result["age_days"],
            "first_verification": result["first_verification"],
            "steam_earnings": stats.get("steam_earnings", 0),
            "message": "Steam профиль проверен"
        }
        
        if result["first_verification"]:
            response["bonus_awarded"] = 1000
            response["message"] = "Steam профиль подтвержден! +1000 баллов"
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка проверки Steam профиля: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

async def check_steam_profile_demo() -> Dict[str, Any]:
    """Демо режим проверки Steam профиля"""
    return {
        "success": True,
        "verified": True,
        "steam_id": "76561198000000000",
        "level": 10,
        "games": 42,
        "badges": 7,
        "age_days": 365,
        "first_verification": False,
        "steam_earnings": 1000,
        "message": "Steam профиль проверен",
        "demo_mode": True
    }

@app.post("/api/earn/invite-friend")
async def invite_friend(
    data: InviteFriendRequest,
    auth_data: Dict[str, Any] = Depends(verify_telegram_auth)
):
    """Приглашение друга по реферальной ссылке"""
    try:
        user_info = auth_data['user']
        demo_mode = auth_data.get('demo_mode', False)
        user_id = user_info.get('id')
        referral_code = data.referral_code.strip()
        
        if demo_mode:
            return await invite_friend_demo()
        
        # Получаем текущего пользователя
        current_user = db.get_user(telegram_id=user_id)
        if not current_user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Пользователь не может пригласить сам себя
        if referral_code == current_user['referral_code']:
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Нельзя использовать свой реферальный код",
                    "message": "Используйте код другого пользователя"
                }
            )
        
        # Находим пользователя по реферальному коду
        conn = db.get_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT id FROM users WHERE referral_code = ?",
            (referral_code,)
        )
        
        referrer = cursor.fetchone()
        
        if not referrer:
            conn.close()
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Неверный реферальный код",
                    "message": "Такой реферальный код не существует"
                }
            )
        
        referrer_id = referrer['id']
        
        # Проверяем, не является ли пользователь уже чьим-то рефералом
        if current_user['referred_by']:
            conn.close()
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Уже есть пригласивший",
                    "message": "Вы уже были приглашены другим пользователем"
                }
            )
        
        # Добавляем реферала
        if not db.add_referral(referrer_id, current_user['id']):
            conn.close()
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "error": "Ошибка добавления реферала",
                    "message": "Не удалось добавить реферала"
                }
            )
        
        # Начисляем бонус пригласившему
        referral_bonus = 500
        if db.update_user_balance(
            referrer_id,
            referral_bonus,
            "referral_bonus",
            json.dumps({"referred_user_id": current_user['id']})
        ):
            # Отмечаем, что бонус получен
            cursor.execute('''
                UPDATE referrals SET bonus_received = 1
                WHERE referrer_id = ? AND referred_id = ?
            ''', (referrer_id, current_user['id']))
        
        conn.commit()
        conn.close()
        
        # Получаем обновленные данные
        current_user = db.get_user(user_id=current_user['id'])
        referral_info = db.get_referral_info(current_user['id'])
        
        response = {
            "success": True,
            "bonus_awarded": referral_bonus,
            "to_user_id": referrer_id,
            "new_balance": current_user['points'],
            "referral_info": referral_info,
            "message": f"Вы успешно присоединились по реферальной ссылке! Пригласивший получил {referral_bonus} баллов"
        }
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка приглашения друга: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

async def invite_friend_demo() -> Dict[str, Any]:
    """Демо режим приглашения друга"""
    return {
        "success": True,
        "bonus_awarded": 500,
        "to_user_id": 1,
        "new_balance": 1500,
        "referral_info": {
            "total_referrals": 3,
            "active_referrals": 3,
            "referral_code": "ref_1003215844_demo",
            "referral_link": "https://t.me/rancasebot?start=ref_1003215844_demo"
        },
        "message": "Вы успешно присоединились по реферальной ссылке! Пригласивший получил 500 баллов",
        "demo_mode": True
    }

@app.get("/api/earn/referral-info")
async def get_referral_info(auth_data: Dict[str, Any] = Depends(verify_telegram_auth)):
    """Получение информации о реферальной системе"""
    try:
        user_info = auth_data['user']
        demo_mode = auth_data.get('demo_mode', False)
        user_id = user_info.get('id')
        
        if demo_mode:
            return {
                "success": True,
                "referral_code": f"ref_{user_id}_demo",
                "referral_link": f"https://t.me/rancasebot?start=ref_{user_id}_demo",
                "total_referrals": 3,
                "active_referrals": 3,
                "total_earned": 1500,
                "referral_tier": 0,
                "milestones": [
                    {"invites": 5, "bonus": 1000, "badge": "🎖️ Начинающий"},
                    {"invites": 10, "bonus": 2500, "badge": "🥉 Бронзовый агент"}
                ],
                "demo_mode": True
            }
        
        # Получаем пользователя
        user = db.get_user(telegram_id=user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Получаем реферальную информацию
        referral_info = db.get_referral_info(user['id'])
        
        # Получаем статистику
        stats = db.get_user_stats(user['id'])
        
        response = {
            "success": True,
            "referral_code": user['referral_code'],
            "referral_link": referral_info['referral_link'],
            "total_referrals": referral_info['total_referrals'],
            "active_referrals": referral_info['active_referrals'],
            "total_earned": stats.get('referral_earnings', 0),
            "referral_tier": min(referral_info['total_referrals'] // 5, 4),
            "milestones": [
                {"invites": 5, "bonus": 1000, "badge": "🎖️ Начинающий"},
                {"invites": 10, "bonus": 2500, "badge": "🥉 Бронзовый агент"},
                {"invites": 25, "bonus": 7500, "badge": "🥈 Серебряный агент"},
                {"invites": 50, "bonus": 20000, "badge": "🥇 Золотой агент"},
                {"invites": 100, "bonus": 50000, "badge": "👑 Король рефералов"}
            ]
        }
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения реферальной информации: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.get("/api/available-promos")
async def get_available_promos():
    """Получение списка доступных промокодов"""
    try:
        conn = db.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT code, points, max_uses, used_count, description,
                   CASE 
                       WHEN max_uses = -1 THEN '∞'
                       ELSE max_uses - used_count
                   END as remaining_uses
            FROM promo_codes
            WHERE is_active = 1 
            AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            ORDER BY points DESC
        ''')
        
        promos = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        return {
            "success": True,
            "promos": promos,
            "total": len(promos),
            "server_time": time.time()
        }
        
    except Exception as e:
        logger.error(f"Ошибка получения промокодов: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@app.get("/api/test")
async def test_endpoint():
    """Тестовый endpoint для проверки работы API"""
    try:
        # Получаем статистику базы данных
        conn = db.get_connection()
        cursor = conn.cursor()
        
        tables = ['users', 'inventory', 'referrals', 'promo_codes', 
                  'withdrawal_requests', 'telegram_profiles', 'steam_profiles']
        
        stats = {}
        for table in tables:
            cursor.execute(f"SELECT COUNT(*) as count FROM {table}")
            stats[table] = cursor.fetchone()['count']
        
        conn.close()
        
        return {
            "success": True,
            "message": "API v2.0.2 работает корректно",
            "timestamp": time.time(),
            "database": "SQLite",
            "stats": stats,
            "endpoints": [
                "/api/health",
                "/api/user",
                "/api/open-case",
                "/api/daily-bonus",
                "/api/activate-promo",
                "/api/withdraw-item",
                "/api/set-trade-link",
                "/api/available-promos",
                "/api/earn/check-telegram",
                "/api/earn/check-steam",
                "/api/earn/invite-friend",
                "/api/earn/referral-info",
                "/api/version",
                "/api/check-update",
                "/api/can-use-referral",
                "/api/auth/telegram",
                "/api/auth/logout"
            ]
        }
    except Exception as e:
        logger.error(f"Ошибка тестового endpoint: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")

# ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

def check_daily_bonus_available(user_id: int) -> bool:
    """Проверяет доступность ежедневного бонуса"""
    conn = db.get_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT bonus_date FROM daily_bonuses 
        WHERE user_id = ? 
        ORDER BY bonus_date DESC 
        LIMIT 1
    ''', (user_id,))
    
    result = cursor.fetchone()
    conn.close()
    
    if not result:
        return True
    
    last_bonus_date = datetime.fromisoformat(result['bonus_date'])
    today = datetime.now().date()
    
    return last_bonus_date.date() < today

def get_daily_streak(user_id: int) -> int:
    """Получает текущий стрик ежедневных бонусов"""
    conn = db.get_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT streak FROM daily_bonuses 
        WHERE user_id = ? 
        ORDER BY bonus_date DESC 
        LIMIT 1
    ''', (user_id,))
    
    result = cursor.fetchone()
    conn.close()
    
    return result['streak'] if result else 0

def record_daily_bonus(user_id: int, points: int, streak: int):
    """Записывает получение ежедневного бонуса"""
    conn = db.get_connection()
    cursor = conn.cursor()
    
    today = datetime.now().date().isoformat()
    
    cursor.execute('''
        INSERT INTO daily_bonuses (user_id, bonus_date, points, streak)
        VALUES (?, ?, ?, ?)
    ''', (user_id, today, points, streak))
    
    conn.commit()
    conn.close()

def get_next_bonus_time(user_id: int) -> int:
    """Возвращает время следующего доступного бонуса"""
    conn = db.get_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT bonus_date FROM daily_bonuses 
        WHERE user_id = ? 
        ORDER BY bonus_date DESC 
        LIMIT 1
    ''', (user_id,))
    
    result = cursor.fetchone()
    conn.close()
    
    if not result:
        return int(time.time())
    
    last_bonus_date = datetime.fromisoformat(result['bonus_date'])
    next_bonus_time = last_bonus_date + timedelta(days=1)
    
    return int(next_bonus_time.timestamp())

# Middleware для управления кешем
@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)
    
    # Для статических файлов - кешировать, но с проверкой
    if request.url.path.endswith(('.css', '.js', '.json', '.ico')):
        response.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"
        response.headers["ETag"] = f'"{hashlib.md5(str(time.time()).encode()).hexdigest()}"'
    # Для API - не кешировать
    elif request.url.path.startswith('/api/'):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    # Для HTML - не кешировать
    elif request.url.path == '/':
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    
    return response

# Middleware для логирования
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    if request.url.path != "/api/health" and not request.url.path.endswith(('.js', '.css', '.ico', '.json')):
        logger.info(f"👉 {request.method} {request.url.path} - Client: {request.client.host if request.client else 'unknown'}")
    
    response = await call_next(request)
    process_time = time.time() - start_time
    
    if request.url.path != "/api/health" and not request.url.path.endswith(('.js', '.css', '.ico', '.json')):
        logger.info(f"👈 {request.method} {request.url.path} - {response.status_code} - {process_time:.3f}s")
    
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, HEAD"
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
    logger.info("🚀 Запуск CS2 Bot API сервера v2.0.2...")
    logger.info("📊 База данных: SQLite")
    logger.info(f"🤖 Токен бота: {TOKEN[:8]}...{TOKEN[-4:] if len(TOKEN) > 12 else ''}")
    logger.info(f"🔧 Режим отладки: {os.environ.get('DEBUG_MODE', 'True')}")
    logger.info("🔄 Автоматическое обновление кеша: ВКЛЮЧЕНО")
    logger.info("🔐 OAuth авторизация: ДОСТУПНА")

# Точка входа для WSGI
if __name__ == "__main__":
    import uvicorn
    
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
