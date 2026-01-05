# app.py - CS2 Bot API Server с базой данных
from fastapi import FastAPI, HTTPException, Depends, Header, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse, Response
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
import urllib.parse

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
    version="2.1.0",  # Обновленная версия с поддержкой браузерной авторизации
    docs_url="/docs",
    redoc_url="/redoc"
)

# Конфигурация бота
TOKEN = "7836761722:AAGzXQjiYuX_MOM9ZpMvrVtBx3175giOprQ"
ADMIN_IDS = [1003215844]
REQUIRED_CHANNEL = "@ranworkcs"

BASE_DIR = Path(__file__).resolve().parent

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
async def serve_root():
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
                    <h1>CS2 Bot API v2.1.0</h1>
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

# ===== API ДЛЯ ОБНОВЛЕНИЙ И АВТОРИЗАЦИИ =====
@app.get("/api/version")
async def get_version():
    """Возвращает версию приложения"""
    return {
        "version": "2.1.0",
        "build_date": datetime.now().isoformat(),
        "features": ["auto_update", "cache_control", "enhanced_earn", "browser_auth"],
        "requires_refresh": False,
        "telegram_bot": "@rancasebot",
        "browser_auth": True
    }

@app.get("/api/telegram-auth")
async def telegram_auth(request: Request):
    """Обработка авторизации через Telegram Login Widget"""
    try:
        # Получаем параметры из URL
        query_params = dict(request.query_params)
        
        logger.info(f"Telegram auth request: {query_params}")
        
        # Извлекаем данные
        auth_data = {}
        for key in ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash']:
            if key in query_params:
                auth_data[key] = query_params[key]
        
        user_id = auth_data.get('id')
        if not user_id:
            return HTMLResponse("""
                <html>
                <head>
                    <title>Ошибка авторизации</title>
                    <meta charset="utf-8">
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            text-align: center;
                            padding: 40px;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            height: 100vh;
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            align-items: center;
                        }
                        .container {
                            background: rgba(255, 255, 255, 0.1);
                            backdrop-filter: blur(10px);
                            padding: 30px;
                            border-radius: 15px;
                            max-width: 400px;
                        }
                        button {
                            background: white;
                            color: #667eea;
                            border: none;
                            padding: 12px 24px;
                            border-radius: 8px;
                            font-size: 16px;
                            cursor: pointer;
                            margin-top: 20px;
                            font-weight: bold;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h2>❌ Ошибка авторизации</h2>
                        <p>Не получен ID пользователя</p>
                        <button onclick="window.close()">Закрыть</button>
                    </div>
                </body>
                </html>
            """)
        
        # Сохраняем данные пользователя
        user_data = {
            'id': user_id,
            'first_name': auth_data.get('first_name', ''),
            'last_name': auth_data.get('last_name', ''),
            'username': auth_data.get('username', ''),
            'photo_url': auth_data.get('photo_url', ''),
            'auth_date': auth_data.get('auth_date', '')
        }
        
        # Создаем или получаем пользователя в БД
        user = db.get_or_create_user(
            telegram_id=int(user_id),
            username=user_data.get('username'),
            first_name=user_data.get('first_name'),
            last_name=user_data.get('last_name')
        )
        
        # Возвращаем страницу с JavaScript для сохранения данных
        return HTMLResponse(f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Авторизация успешна</title>
                <meta charset="utf-8">
                <style>
                    body {{
                        font-family: Arial, sans-serif;
                        text-align: center;
                        padding: 40px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                    }}
                    .container {{
                        background: rgba(255, 255, 255, 0.1);
                        backdrop-filter: blur(10px);
                        padding: 30px;
                        border-radius: 15px;
                        max-width: 400px;
                    }}
                    .success-icon {{
                        font-size: 60px;
                        margin-bottom: 20px;
                    }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="success-icon">✅</div>
                    <h2>Авторизация успешна!</h2>
                    <p>Добро пожаловать, {user_data.get('first_name', 'Пользователь')}!</p>
                    <p>Окно закроется автоматически...</p>
                </div>
                
                <script>
                    // Сохраняем данные пользователя
                    const userData = {json.dumps(user_data)};
                    const authData = {{
                        user: userData,
                        auth_date: Date.now(),
                        valid: true,
                        browser_auth: true
                    }};
                    
                    localStorage.setItem('telegram_auth_data', JSON.stringify(authData));
                    
                    // Отправляем сообщение родительскому окну
                    if (window.opener && !window.opener.closed) {{
                        window.opener.postMessage({{
                            type: 'telegram_auth_success',
                            data: authData
                        }}, '*');
                    }}
                    
                    // Закрываем окно через 2 секунды
                    setTimeout(() => {{
                        window.close();
                    }}, 2000);
                </script>
            </body>
            </html>
        """)
        
    except Exception as e:
        logger.error(f"Ошибка авторизации: {e}")
        return HTMLResponse(f"""
            <html>
            <head>
                <title>Ошибка авторизации</title>
                <meta charset="utf-8">
                <style>
                    body {{
                        font-family: Arial, sans-serif;
                        text-align: center;
                        padding: 40px;
                        background: linear-gradient(135deg, #f44336 0%, #e53935 100%);
                        color: white;
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                    }}
                    .container {{
                        background: rgba(255, 255, 255, 0.1);
                        backdrop-filter: blur(10px);
                        padding: 30px;
                        border-radius: 15px;
                        max-width: 400px;
                    }}
                    button {{
                        background: white;
                        color: #f44336;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-size: 16px;
                        cursor: pointer;
                        margin-top: 20px;
                        font-weight: bold;
                    }}
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>❌ Ошибка авторизации</h2>
                    <p>{str(e)}</p>
                    <button onclick="window.close()">Закрыть</button>
                </div>
            </body>
            </html>
        """)

@app.get("/api/telegram-auth-simple")
async def telegram_auth_simple(request: Request):
    """Упрощенная авторизация (только для демо)"""
    query_params = dict(request.query_params)
    
    logger.info(f"Simple auth request: {query_params}")
    
    user_data = {
        'id': query_params.get('id', '1003215844'),
        'first_name': query_params.get('first_name', 'Тестовый'),
        'last_name': query_params.get('last_name', 'Пользователь'),
        'username': query_params.get('username', 'test_user'),
        'auth_date': query_params.get('auth_date', str(int(time.time())))
    }
    
    return HTMLResponse(f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Авторизация</title>
            <meta charset="utf-8">
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    text-align: center;
                    padding: 40px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                }}
                .container {{
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    padding: 30px;
                    border-radius: 15px;
                    max-width: 400px;
                }}
                .success-icon {{
                    font-size: 60px;
                    margin-bottom: 20px;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="success-icon">✅</div>
                <h2>Демо-авторизация</h2>
                <p>Добро пожаловать, {user_data['first_name']}!</p>
                <p>Окно закроется автоматически...</p>
            </div>
            
            <script>
                const userData = {json.dumps(user_data)};
                const authData = {{
                    user: userData,
                    auth_date: Date.now(),
                    valid: true,
                    browser_auth: true,
                    demo_mode: true
                }};
                
                // Сохраняем данные
                localStorage.setItem('telegram_auth_data', JSON.stringify(authData));
                
                // Отправляем сообщение родительскому окну
                if (window.opener && !window.opener.closed) {{
                    window.opener.postMessage({{
                        type: 'telegram_auth_success',
                        data: authData
                    }}, '*');
                }}
                
                // Закрываем окно через 2 секунды
                setTimeout(() => {{
                    window.close();
                }}, 2000);
            </script>
        </body>
        </html>
    """)

@app.post("/api/clear-cache")
async def clear_cache(request: UpdateRequest):
    """Очистка кеша"""
    return {
        "success": True,
        "message": "Кеш будет очищен при следующей загрузке",
        "timestamp": time.time(),
        "force_refresh": request.force,
        "next_version": "2.1.0"
    }

@app.get("/api/check-update")
async def check_update():
    """Проверка обновлений"""
    return {
        "update_available": False,
        "current_version": "2.1.0",
        "latest_version": "2.1.0",
        "changelog": "Добавлена браузерная авторизация через Telegram",
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
    authorization: str = Header(None, alias="Authorization"),
    x_telegram_user_id: str = Header(None, alias="X-Telegram-User-ID"),
    x_browser_auth: str = Header(None, alias="X-Browser-Auth")
) -> Dict[str, Any]:
    """Проверяет аутентификацию через Telegram Mini App ИЛИ браузер"""
    try:
        logger.info(f"Запрос на аутентификацию: {request.url.path}")
        
        # Разрешаем тестирование без авторизации для всех API endpoints
        DEBUG_MODE = os.environ.get('DEBUG_MODE', 'True') == 'True'
        
        if DEBUG_MODE:
            if not authorization or not authorization.startswith("tma "):
                logger.info("🔧 Демо-режим: использование тестовых данных")
                return {
                    'user': {
                        'id': 1003215844,
                        'first_name': 'Тестовый',
                        'username': 'test_user',
                        'last_name': 'Пользователь'
                    },
                    'valid': True,
                    'demo_mode': True
                }
        
        # 1. Проверяем Telegram Mini App авторизацию
        if authorization and authorization.startswith("tma "):
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
            
            logger.info(f"Успешная аутентификация пользователя через Mini App: {validated_data.get('user', {}).get('id')}")
            validated_data['demo_mode'] = False
            validated_data['browser_auth'] = False
            return validated_data
        
        # 2. Проверяем браузерную авторизацию
        elif x_telegram_user_id or x_browser_auth:
            logger.info(f"🔐 Браузерная авторизация: user_id={x_telegram_user_id}")
            
            # Получаем данные из заголовков или body
            user_id = x_telegram_user_id
            
            if not user_id:
                # Пробуем получить из body для POST запросов
                try:
                    body = await request.json()
                    user_id = body.get('user_id') if body else None
                except:
                    pass
            
            if not user_id:
                raise HTTPException(status_code=401, detail="Требуется ID пользователя")
            
            # Здесь можно проверить пользователя в БД
            user = db.get_user(telegram_id=int(user_id))
            if user:
                return {
                    'user': {
                        'id': user['telegram_id'],
                        'first_name': user.get('first_name', ''),
                        'last_name': user.get('last_name', ''),
                        'username': user.get('username', ''),
                        'telegram_db_id': user['id']
                    },
                    'valid': True,
                    'browser_auth': True,
                    'demo_mode': False
                }
            else:
                # Для браузерной авторизации создаем демо пользователя
                logger.info(f"Создаем демо пользователя для браузерной авторизации: {user_id}")
                return {
                    'user': {
                        'id': int(user_id),
                        'first_name': 'Браузерный',
                        'last_name': 'Пользователь',
                        'username': f'user_{user_id}'
                    },
                    'valid': True,
                    'browser_auth': True,
                    'demo_mode': True
                }
        
        # 3. Разрешаем публичные endpoints без авторизации
        public_paths = [
            "/api/health", "/api/available-promos", "/api/test", 
            "/api/version", "/api/check-update", "/",
            "/style.css", "/script.js", "/manifest.json", "/service-worker.js"
        ]
        
        if request.url.path in public_paths:
            return {'user': None, 'valid': True, 'public': True}
        
        # Для остальных endpoints проверяем наличие данных в сессии
        # (браузерная авторизация через localStorage)
        logger.warning(f"Требуется авторизация для: {request.url.path}")
        raise HTTPException(status_code=401, detail="Требуется авторизация через Telegram")
        
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
            "service": "CS2 Bot API v2.1.0",
            "version": "2.1.0",
            "timestamp": time.time(),
            "database": "SQLite",
            "users_count": user_count,
            "telegram_bot": "connected" if TOKEN else "disconnected",
            "debug_mode": os.environ.get('DEBUG_MODE', 'True'),
            "auto_update": True,
            "cache_version": int(time.time()),
            "browser_auth_supported": True
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
        user_info = auth_data.get('user')
        demo_mode = auth_data.get('demo_mode', False)
        browser_auth = auth_data.get('browser_auth', False)
        
        if not user_info:
            raise HTTPException(status_code=400, detail="Данные пользователя не найдены")
        
        user_id = user_info.get('id')
        
        if not user_id:
            raise HTTPException(status_code=400, detail="ID пользователя не найден")
        
        if demo_mode or browser_auth:
            # В демо-режиме или браузерной авторизации всегда можно использовать в течение 5 минут
            demo_time_left = 300  # 5 минут
            return {
                "success": True,
                "can_use": True,
                "time_left": demo_time_left,
                "minutes_left": demo_time_left / 60,
                "message": "Вы можете ввести реферальный код",
                "demo_mode": True,
                "browser_auth": browser_auth
            }
        
        # Получаем пользователя из базы данных
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
        user_info = auth_data.get('user')
        demo_mode = auth_data.get('demo_mode', False)
        browser_auth = auth_data.get('browser_auth', False)
        
        if not user_info:
            # Для публичного доступа возвращаем демо данные
            return await get_demo_user_data({
                'id': 1003215844,
                'first_name': 'Гость',
                'username': 'guest',
                'last_name': ''
            })
        
        user_id = user_info.get('id')
        
        if not user_id:
            raise HTTPException(status_code=400, detail="ID пользователя не найден")
        
        if demo_mode or browser_auth:
            # Для демо-режима или браузерной авторизации возвращаем демо данные
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
                "is_subscribed": bool(user['is_subscribed'])
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
            "cache_version": int(time.time() / 3600),  # Меняется каждый час
            "auth_type": "browser" if browser_auth else "telegram"
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
            "is_subscribed": True
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

# ... остальные endpoint функции остаются без изменений ...
# (open_case, daily_bonus, activate_promo, withdraw_item, set_trade_link и т.д.)

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
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, HEAD"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Max-Age"] = "600"
    return response

# Инициализация при запуске
@app.on_event("startup")
async def startup_event():
    """Инициализация при запуске сервера"""
    logger.info("🚀 Запуск CS2 Bot API сервера v2.1.0...")
    logger.info("📊 База данных: SQLite")
    logger.info(f"🤖 Токен бота: {TOKEN[:8]}...{TOKEN[-4:] if len(TOKEN) > 12 else ''}")
    logger.info(f"🔧 Режим отладки: {os.environ.get('DEBUG_MODE', 'True')}")
    logger.info("🌐 Поддержка браузерной авторизации: ВКЛЮЧЕНО")
    logger.info("🔄 Автоматическое обновление кеша: ВКЛЮЧЕНО")

# Точка входа для WSGI
if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get("PORT", 8000))
    
    logger.info(f"🌐 Запуск сервера на http://0.0.0.0:{port}")
    logger.info(f"📚 Документация: http://0.0.0.0:{port}/docs")
    logger.info(f"🔍 Тест API: http://0.0.0.0:{port}/api/test")
    logger.info(f"🔐 Telegram Auth: http://0.0.0.0:{port}/api/telegram-auth")
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=port,
        log_level="info",
        access_log=True
    )
