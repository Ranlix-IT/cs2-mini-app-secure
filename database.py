# database.py - SQLite база данных для CS2 Bot
import sqlite3
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
import os
from pathlib import Path

logger = logging.getLogger(__name__)

class Database:
    def __init__(self, db_path: str = "data/cs2_bot.db"):
        """Инициализация базы данных"""
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(exist_ok=True)
        self.init_database()
    
    def get_connection(self):
        """Создает соединение с базой данных"""
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn
    
    def init_database(self):
        """Инициализация таблиц базы данных"""
        logger.info("📀 Инициализация базы данных...")
        
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Таблица пользователей
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            telegram_id INTEGER UNIQUE,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            language_code TEXT,
            points INTEGER DEFAULT 100,
            referral_code TEXT UNIQUE,
            referred_by INTEGER,
            trade_link TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_subscribed BOOLEAN DEFAULT FALSE,
            subscription_date TIMESTAMP,
            total_earned INTEGER DEFAULT 0,
            FOREIGN KEY (referred_by) REFERENCES users(id)
        )
        ''')
        
        # Таблица инвентаря
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            item_name TEXT,
            item_type TEXT,
            item_rarity TEXT,
            item_price INTEGER,
            case_price INTEGER,
            steam_market_id TEXT,
            steam_inspect_link TEXT,
            status TEXT DEFAULT 'available', -- available, withdrawn, sold, expired
            withdraw_request_date TIMESTAMP,
            withdraw_complete_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        ''')
        
        # Таблица рефералов
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id INTEGER,
            referred_id INTEGER UNIQUE,
            bonus_received BOOLEAN DEFAULT FALSE,
            referral_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_tasks INTEGER DEFAULT 0,
            total_earned INTEGER DEFAULT 0,
            FOREIGN KEY (referrer_id) REFERENCES users(id),
            FOREIGN KEY (referred_id) REFERENCES users(id)
        )
        ''')
        
        # Таблица промокодов
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS promo_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            points INTEGER,
            max_uses INTEGER,
            used_count INTEGER DEFAULT 0,
            description TEXT,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            is_active BOOLEAN DEFAULT TRUE
        )
        ''')
        
        # Таблица использованных промокодов
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS used_promo_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            promo_code_id INTEGER,
            used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id),
            UNIQUE(user_id, promo_code_id)
        )
        ''')
        
        # Таблица ежедневных бонусов
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS daily_bonuses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            bonus_date DATE,
            points INTEGER,
            streak INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, bonus_date)
        )
        ''')
        
        # Таблица Telegram профилей
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS telegram_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            last_name TEXT,
            bio TEXT,
            has_bot_in_lastname BOOLEAN DEFAULT FALSE,
            has_bot_in_bio BOOLEAN DEFAULT FALSE,
            is_verified BOOLEAN DEFAULT FALSE,
            last_check TIMESTAMP,
            verification_date TIMESTAMP,
            total_earned INTEGER DEFAULT 0,
            next_reward_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        ''')
        
        # Таблица Steam профилей
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS steam_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            steam_id TEXT UNIQUE,
            steam_url TEXT,
            profile_name TEXT,
            profile_level INTEGER DEFAULT 0,
            has_bot_in_description BOOLEAN DEFAULT FALSE,
            is_public BOOLEAN DEFAULT FALSE,
            is_verified BOOLEAN DEFAULT FALSE,
            last_check TIMESTAMP,
            verification_date TIMESTAMP,
            total_earned INTEGER DEFAULT 0,
            next_reward_date TIMESTAMP,
            games_count INTEGER DEFAULT 0,
            badges_count INTEGER DEFAULT 0,
            profile_age_days INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        ''')
        
        # Таблица кейсов
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            price INTEGER,
            rarity_distribution TEXT, -- JSON с распределением редкостей
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # Таблица предметов для кейсов
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS case_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER,
            item_name TEXT,
            item_type TEXT,
            item_rarity TEXT,
            min_price INTEGER,
            max_price INTEGER,
            drop_chance REAL, -- шанс выпадения в %
            steam_market_link TEXT,
            image_url TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            FOREIGN KEY (case_id) REFERENCES cases(id)
        )
        ''')
        
        # Таблица статистики
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_stats (
            user_id INTEGER UNIQUE,
            total_cases_opened INTEGER DEFAULT 0,
            total_spent INTEGER DEFAULT 0,
            total_earned INTEGER DEFAULT 0,
            total_withdrawn INTEGER DEFAULT 0,
            referral_earnings INTEGER DEFAULT 0,
            telegram_earnings INTEGER DEFAULT 0,
            steam_earnings INTEGER DEFAULT 0,
            daily_bonus_earnings INTEGER DEFAULT 0,
            promo_earnings INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        ''')
        
        # Таблица логов действий
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS action_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action_type TEXT,
            action_data TEXT,
            points_change INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        ''')
        
        # Таблица запросов на вывод
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS withdrawal_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            item_id INTEGER,
            trade_link TEXT,
            status TEXT DEFAULT 'pending', -- pending, processing, completed, rejected
            admin_notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (item_id) REFERENCES inventory(id)
        )
        ''')
        
        conn.commit()
        conn.close()
        
        # Добавляем тестовые данные
        self.add_test_data()
        
        logger.info("✅ База данных инициализирована")
    
    def add_test_data(self):
        """Добавление тестовых данных"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Проверяем, есть ли уже кейсы
            cursor.execute("SELECT COUNT(*) FROM cases")
            if cursor.fetchone()[0] == 0:
                # Добавляем кейсы
                cases = [
                    ("Базовый кейс", 500, '{"common": 70, "uncommon": 25, "rare": 5}'),
                    ("Продвинутый кейс", 3000, '{"common": 50, "uncommon": 35, "rare": 10, "epic": 5}'),
                    ("Премиум кейс", 5000, '{"common": 30, "uncommon": 40, "rare": 20, "epic": 8, "legendary": 2}'),
                    ("Элитный кейс", 10000, '{"uncommon": 30, "rare": 40, "epic": 20, "legendary": 10}'),
                    ("Легендарный кейс", 15000, '{"rare": 40, "epic": 35, "legendary": 25}')
                ]
                
                for case in cases:
                    cursor.execute(
                        "INSERT INTO cases (name, price, rarity_distribution) VALUES (?, ?, ?)",
                        case
                    )
                    case_id = cursor.lastrowid
                    
                    # Добавляем предметы для кейса
                    items = self.get_case_items(case[0], case_id)
                    for item in items:
                        cursor.execute('''
                            INSERT INTO case_items 
                            (case_id, item_name, item_type, item_rarity, min_price, max_price, drop_chance, steam_market_link)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ''', item)
            
            # Проверяем промокоды
            cursor.execute("SELECT COUNT(*) FROM promo_codes")
            if cursor.fetchone()[0] == 0:
                promos = [
                    ("WELCOME1", 100, -1, "Добро пожаловать!", 1),
                    ("CS2FUN", 250, 100, "Для настоящих фанатов CS2", 1),
                    ("RANWORK", 500, 50, "От создателей бота", 1),
                    ("START100", 100, -1, "Стартовый бонус", 1),
                    ("MINIAPP", 200, 200, "За запуск Mini App", 1),
                    ("REFER500", 500, -1, "За приглашение друга", 1),
                    ("TELEGRAM500", 500, -1, "За настройку Telegram профиля", 1),
                    ("STEAM1000", 1000, -1, "За настройку Steam профиля", 1)
                ]
                
                for promo in promos:
                    cursor.execute('''
                        INSERT INTO promo_codes 
                        (code, points, max_uses, description, created_by, expires_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', (*promo, datetime.now() + timedelta(days=365)))
            
            conn.commit()
            conn.close()
            logger.info("✅ Тестовые данные добавлены")
            
        except Exception as e:
            logger.error(f"❌ Ошибка добавления тестовых данных: {e}")
    
    def get_case_items(self, case_name: str, case_id: int) -> List[Tuple]:
        """Возвращает предметы для конкретного кейса"""
        items_db = {
            "Базовый кейс": [
                (case_id, "Наклейка | ENCE |", "sticker", "common", 100, 200, 40, "https://steamcommunity.com/market/listings/730/Sticker%20%7C%20ENCE"),
                (case_id, "Наклейка | Grayhound", "sticker", "common", 100, 200, 35, "https://steamcommunity.com/market/listings/730/Sticker%20%7C%20Grayhound"),
                (case_id, "Наклейка | PGL |", "sticker", "common", 100, 250, 25, "https://steamcommunity.com/market/listings/730/Sticker%20%7C%20PGL"),
            ],
            "Продвинутый кейс": [
                (case_id, "Наклейка | huNter |", "sticker", "uncommon", 300, 500, 30, "https://steamcommunity.com/market/listings/730/Sticker%20%7C%20huNter%20%7C"),
                (case_id, "FAMAS | Колония", "weapon", "uncommon", 800, 1200, 35, "https://steamcommunity.com/market/listings/730/FAMAS%20%7C%20Colony"),
                (case_id, "UMP-45 | Внедорожник", "weapon", "uncommon", 700, 1100, 25, "https://steamcommunity.com/market/listings/730/UMP-45%20%7C%20Mudder"),
                (case_id, "Sticker | XD", "sticker", "rare", 1500, 2000, 10, "https://steamcommunity.com/market/listings/730/Sticker%20%7C%20XD"),
            ],
            "Премиум кейс": [
                (case_id, "Five-SeveN | Хладагент", "weapon", "rare", 1500, 2500, 40, "https://steamcommunity.com/market/listings/730/Five-SeveN%20%7C%20Coolant"),
                (case_id, "Капсула с наклейками", "case", "rare", 2000, 3000, 35, "https://steamcommunity.com/market/listings/730/Sticker%20Capsule"),
                (case_id, "Sticker | From The Deep", "sticker", "rare", 2500, 3500, 15, "https://steamcommunity.com/market/listings/730/Sticker%20%7C%20From%20The%20Deep"),
                (case_id, "MAC-10 | Океанский дракон", "weapon", "epic", 4000, 6000, 8, "https://steamcommunity.com/market/listings/730/MAC-10%20%7C%20Ocean%20Dragon"),
                (case_id, "Брелок | Щепотка соли", "collectible", "legendary", 8000, 12000, 2, "https://steamcommunity.com/market/listings/730/Salt%20Shaker"),
            ]
        }
        
        return items_db.get(case_name, [])
    
    # === ПОЛЬЗОВАТЕЛИ ===
    
    def get_or_create_user(self, telegram_id: int, username: str = None, 
                          first_name: str = None, last_name: str = None, 
                          language_code: str = 'ru') -> Dict[str, Any]:
        """Получает или создает пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT * FROM users WHERE telegram_id = ?",
            (telegram_id,)
        )
        user = cursor.fetchone()
        
        if not user:
            # Генерируем реферальный код
            import secrets
            referral_code = f"ref_{telegram_id}_{secrets.token_hex(4)}"
            
            cursor.execute('''
                INSERT INTO users 
                (telegram_id, username, first_name, last_name, language_code, referral_code, created_at, last_active)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ''', (telegram_id, username, first_name, last_name, language_code, referral_code))
            
            user_id = cursor.lastrowid
            
            # Создаем запись статистики
            cursor.execute('''
                INSERT INTO user_stats (user_id) VALUES (?)
            ''', (user_id,))
            
            # Создаем запись для Telegram профиля
            cursor.execute('''
                INSERT INTO telegram_profiles (user_id) VALUES (?)
            ''', (user_id,))
            
            # Создаем запись для Steam профиля
            cursor.execute('''
                INSERT INTO steam_profiles (user_id) VALUES (?)
            ''', (user_id,))
            
            conn.commit()
            
            cursor.execute(
                "SELECT * FROM users WHERE id = ?",
                (user_id,)
            )
            user = cursor.fetchone()
        
        else:
            # Обновляем последнюю активность
            cursor.execute('''
                UPDATE users SET 
                username = ?, 
                first_name = ?, 
                last_name = ?,
                last_active = CURRENT_TIMESTAMP
                WHERE telegram_id = ?
            ''', (username, first_name, last_name, telegram_id))
            conn.commit()
        
        conn.close()
        return dict(user) if user else None
    
    def get_user(self, user_id: int = None, telegram_id: int = None) -> Optional[Dict[str, Any]]:
        """Получает пользователя по ID"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        if telegram_id:
            cursor.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
        else:
            cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        
        user = cursor.fetchone()
        conn.close()
        return dict(user) if user else None
    
    def update_user_balance(self, user_id: int, points_change: int, 
                          action_type: str, action_data: str = "") -> bool:
        """Обновляет баланс пользователя и логирует действие"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            # Обновляем баланс
            cursor.execute('''
                UPDATE users SET 
                points = points + ?,
                total_earned = total_earned + ?
                WHERE id = ? AND points + ? >= 0
            ''', (points_change, max(0, points_change), user_id, points_change))
            
            if cursor.rowcount == 0:
                conn.close()
                return False
            
            # Обновляем статистику
            stat_field = self.get_stat_field_for_action(action_type)
            if stat_field:
                cursor.execute(f'''
                    UPDATE user_stats SET 
                    {stat_field} = {stat_field} + ?,
                    total_earned = total_earned + ?,
                    updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                ''', (abs(points_change), max(0, points_change), user_id))
            
            # Логируем действие
            cursor.execute('''
                INSERT INTO action_logs 
                (user_id, action_type, action_data, points_change)
                VALUES (?, ?, ?, ?)
            ''', (user_id, action_type, action_data, points_change))
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            logger.error(f"❌ Ошибка обновления баланса: {e}")
            conn.rollback()
            conn.close()
            return False
    
    def get_stat_field_for_action(self, action_type: str) -> Optional[str]:
        """Возвращает поле статистики для типа действия"""
        mapping = {
            "daily_bonus": "daily_bonus_earnings",
            "open_case": "total_spent",
            "item_sold": "total_earned",
            "promo_code": "promo_earnings",
            "referral_bonus": "referral_earnings",
            "telegram_profile": "telegram_earnings",
            "steam_profile": "steam_earnings",
            "withdrawal": "total_withdrawn"
        }
        return mapping.get(action_type)
    
    # === РЕФЕРАЛЬНАЯ СИСТЕМА ===
    
    def add_referral(self, referrer_id: int, referred_id: int) -> bool:
        """Добавляет реферала (только если пользователь новый и прошло меньше 5 минут)"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            # Проверяем, имеет ли пользователь уже реферера
            cursor.execute('''
                SELECT referred_by, created_at FROM users WHERE id = ?
            ''', (referred_id,))
            
            user = cursor.fetchone()
            if not user:
                conn.close()
                return False  # Пользователь не найден
            
            # Проверяем, есть ли уже реферер
            if user['referred_by']:
                conn.close()
                return False  # Пользователь уже имеет реферера
            
            # Проверяем, является ли пользователь новым (создан менее 5 минут назад)
            created_at = datetime.fromisoformat(user['created_at'])
            now = datetime.now()
            
            # Проверяем, что аккаунт создан менее 5 минут назад
            if (now - created_at).total_seconds() > 300:  # 5 минут = 300 секунд
                conn.close()
                return False  # Прошло больше 5 минут
            
            # Добавляем реферала
            cursor.execute('''
                INSERT INTO referrals (referrer_id, referred_id)
                VALUES (?, ?)
            ''', (referrer_id, referred_id))
            
            # Обновляем пользователя, кто пригласил
            cursor.execute('''
                UPDATE users SET referred_by = ? WHERE id = ?
            ''', (referrer_id, referred_id))
            
            conn.commit()
            conn.close()
            return True
            
        except sqlite3.IntegrityError:
            conn.close()
            return False  # Реферал уже существует
        except Exception as e:
            logger.error(f"❌ Ошибка добавления реферала: {e}")
            conn.rollback()
            conn.close()
            return False
    
    def get_referrals(self, user_id: int) -> List[Dict[str, Any]]:
        """Получает рефералов пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT u.*, r.bonus_received, r.referral_date
            FROM referrals r
            JOIN users u ON r.referred_id = u.id
            WHERE r.referrer_id = ?
            ORDER BY r.referral_date DESC
        ''', (user_id,))
        
        referrals = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return referrals
    
    def get_referral_info(self, user_id: int) -> Dict[str, Any]:
        """Получает информацию о реферальной системе пользователя"""
        referrals = self.get_referrals(user_id)
        user = self.get_user(user_id)
        
        return {
            "total_referrals": len(referrals),
            "active_referrals": len([r for r in referrals]),
            "referral_code": user["referral_code"] if user else None,
            "referred_by": user["referred_by"] if user else None,
            "referral_link": f"https://t.me/rancasebot?start={user['referral_code']}" if user else None
        }
    
    def can_use_referral_code(self, user_id: int) -> Dict[str, Any]:
        """Проверяет, может ли пользователь использовать реферальный код"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            # Проверяем, имеет ли пользователь уже реферера
            cursor.execute('''
                SELECT referred_by, created_at FROM users WHERE id = ?
            ''', (user_id,))
            
            user = cursor.fetchone()
            
            if not user:
                conn.close()
                return {"can_use": False, "reason": "Пользователь не найден"}
            
            # Проверяем, есть ли уже реферер
            if user['referred_by']:
                conn.close()
                return {"can_use": False, "reason": "Вы уже использовали реферальный код"}
            
            # Проверяем время создания аккаунта
            created_at = datetime.fromisoformat(user['created_at'])
            now = datetime.now()
            time_passed = (now - created_at).total_seconds()
            time_left = 300 - time_passed  # 5 минут = 300 секунд
            
            if time_passed > 300:
                conn.close()
                return {
                    "can_use": False, 
                    "reason": "Время для ввода кода истекло",
                    "time_passed": time_passed,
                    "time_left": 0
                }
            
            conn.close()
            return {
                "can_use": True,
                "time_left": max(0, time_left),
                "created_at": user['created_at'],
                "minutes_left": time_left / 60
            }
            
        except Exception as e:
            logger.error(f"❌ Ошибка проверки возможности ввода кода: {e}")
            conn.close()
            return {"can_use": False, "reason": "Ошибка сервера"}
    
    # === ПРОВЕРКА TELEGRAM ПРОФИЛЯ ===
    
    def check_telegram_profile(self, user_id: int, last_name: str = None, 
                              bio: str = None) -> Dict[str, Any]:
        """Проверяет Telegram профиль на наличие бота"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Боты для проверки
        bot_names = ["rancasebot", "RANcaseBot", "@rancasebot"]
        
        has_bot_in_lastname = any(
            bot_name.lower() in (last_name or "").lower() 
            for bot_name in bot_names
        )
        
        has_bot_in_bio = any(
            bot_name.lower() in (bio or "").lower() 
            for bot_name in bot_names
        )
        
        # Для проверки требуется и фамилия, и био
        is_verified = has_bot_in_lastname and has_bot_in_bio
        
        # Получаем текущий статус
        cursor.execute(
            "SELECT * FROM telegram_profiles WHERE user_id = ?",
            (user_id,)
        )
        profile = cursor.fetchone()
        
        now = datetime.now()
        was_verified = profile["is_verified"] if profile else False
        
        if not profile:
            cursor.execute('''
                INSERT INTO telegram_profiles 
                (user_id, last_name, bio, has_bot_in_lastname, has_bot_in_bio, 
                 is_verified, last_check, verification_date, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (user_id, last_name, bio, has_bot_in_lastname, has_bot_in_bio,
                  is_verified, now, now if is_verified else None, now))
        else:
            cursor.execute('''
                UPDATE telegram_profiles SET
                last_name = ?, bio = ?, has_bot_in_lastname = ?, has_bot_in_bio = ?,
                is_verified = ?, last_check = ?, updated_at = ?,
                verification_date = CASE 
                    WHEN ? AND NOT is_verified THEN ?
                    ELSE verification_date 
                END,
                next_reward_date = CASE 
                    WHEN ? AND NOT is_verified THEN ?
                    WHEN NOT ? AND is_verified THEN NULL
                    ELSE next_reward_date
                END
                WHERE user_id = ?
            ''', (
                last_name, bio, has_bot_in_lastname, has_bot_in_bio,
                is_verified, now, now,
                is_verified, now,
                is_verified, now + timedelta(days=7),
                is_verified, now,
                user_id
            ))
        
        conn.commit()
        conn.close()
        
        # Если только что верифицировали - начисляем бонус
        if is_verified and not was_verified:
            self.update_user_balance(
                user_id, 
                500, 
                "telegram_profile",
                "initial_verification_bonus"
            )
        
        return {
            "verified": is_verified,
            "has_bot_in_lastname": has_bot_in_lastname,
            "has_bot_in_bio": has_bot_in_bio,
            "was_verified": was_verified,
            "first_verification": is_verified and not was_verified
        }
    
    # === ПРОВЕРКА STEAM ПРОФИЛЯ ===
    
    def check_steam_profile(self, user_id: int, steam_url: str) -> Dict[str, Any]:
        """Проверяет Steam профиль"""
        # Здесь должна быть интеграция с Steam API
        # Пока что симулируем проверку
        
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Извлекаем Steam ID из URL
        steam_id = self.extract_steam_id_from_url(steam_url)
        
        if not steam_id:
            return {"error": "Неверный Steam URL"}
        
        # Симуляция проверки
        is_public = True
        has_bot_in_description = True
        profile_level = 10
        games_count = 42
        badges_count = 7
        profile_age_days = 365
        
        is_verified = is_public and has_bot_in_description and profile_level >= 3
        
        cursor.execute(
            "SELECT * FROM steam_profiles WHERE user_id = ?",
            (user_id,)
        )
        profile = cursor.fetchone()
        
        now = datetime.now()
        was_verified = profile["is_verified"] if profile else False
        
        if not profile:
            cursor.execute('''
                INSERT INTO steam_profiles 
                (user_id, steam_id, steam_url, profile_level, has_bot_in_description,
                 is_public, is_verified, last_check, verification_date, updated_at,
                 games_count, badges_count, profile_age_days)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (user_id, steam_id, steam_url, profile_level, has_bot_in_description,
                  is_public, is_verified, now, now if is_verified else None, now,
                  games_count, badges_count, profile_age_days))
        else:
            cursor.execute('''
                UPDATE steam_profiles SET
                steam_id = ?, steam_url = ?, profile_level = ?, has_bot_in_description = ?,
                is_public = ?, is_verified = ?, last_check = ?, updated_at = ?,
                games_count = ?, badges_count = ?, profile_age_days = ?,
                verification_date = CASE 
                    WHEN ? AND NOT is_verified THEN ?
                    ELSE verification_date 
                END,
                next_reward_date = CASE 
                    WHEN ? AND NOT is_verified THEN ?
                    WHEN NOT ? AND is_verified THEN NULL
                    ELSE next_reward_date
                END
                WHERE user_id = ?
            ''', (
                steam_id, steam_url, profile_level, has_bot_in_description,
                is_public, is_verified, now, now,
                games_count, badges_count, profile_age_days,
                is_verified, now,
                is_verified, now + timedelta(days=7),
                is_verified, now,
                user_id
            ))
        
        conn.commit()
        conn.close()
        
        # Если только что верифицировали - начисляем бонус
        if is_verified and not was_verified:
            bonus = 1000
            # Бонус за уровень
            if profile_level >= 10:
                bonus += 500
            if profile_level >= 25:
                bonus += 1000
            if profile_level >= 50:
                bonus += 1500
            
            self.update_user_balance(
                user_id, 
                bonus, 
                "steam_profile",
                f"initial_verification_bonus_level_{profile_level}"
            )
        
        return {
            "verified": is_verified,
            "steam_id": steam_id,
            "level": profile_level,
            "games": games_count,
            "badges": badges_count,
            "age_days": profile_age_days,
            "was_verified": was_verified,
            "first_verification": is_verified and not was_verified
        }
    
    def extract_steam_id_from_url(self, url: str) -> Optional[str]:
        """Извлекает Steam ID из URL"""
        import re
        
        patterns = [
            r'steamcommunity\.com/profiles/(\d+)',
            r'steamcommunity\.com/id/([^/?]+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        
        return None
    
    # === ВАЛИДАЦИЯ ТРЕЙД ССЫЛКИ ===
    
    def validate_trade_link(self, trade_link: str) -> Dict[str, Any]:
        """Валидирует трейд ссылку Steam"""
        import re
        
        # Паттерны для валидных трейд ссылок
        patterns = [
            r'https?://steamcommunity\.com/tradeoffer/new/\?partner=\d+&token=[\w-]+',
            r'https?://steamcommunity\.com/tradeoffer/\d+/'
        ]
        
        for pattern in patterns:
            if re.match(pattern, trade_link, re.IGNORECASE):
                # Извлекаем Steam ID из ссылки
                partner_match = re.search(r'partner=(\d+)', trade_link)
                if partner_match:
                    steam_id = partner_match.group(1)
                    return {
                        "valid": True,
                        "steam_id": steam_id,
                        "message": "Трейд ссылка валидна"
                    }
        
        return {
            "valid": False,
            "message": "Неверный формат трейд ссылки. Пример правильной ссылки: https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=abcdef"
        }
    
    # === ДРУГИЕ МЕТОДЫ ===
    
    def get_user_stats(self, user_id: int) -> Dict[str, Any]:
        """Получает статистику пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Основная статистика
        cursor.execute('''
            SELECT u.*, us.*, 
            tp.is_verified as telegram_verified,
            sp.is_verified as steam_verified,
            (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as referrals_count
            FROM users u
            LEFT JOIN user_stats us ON u.id = us.user_id
            LEFT JOIN telegram_profiles tp ON u.id = tp.user_id
            LEFT JOIN steam_profiles sp ON u.id = sp.user_id
            WHERE u.id = ?
        ''', (user_id,))
        
        stats = dict(cursor.fetchone()) if cursor.fetchone() else {}
        
        # Получаем инвентарь
        cursor.execute('''
            SELECT COUNT(*) as total_items, 
                   SUM(item_price) as total_value
            FROM inventory 
            WHERE user_id = ? AND status = 'available'
        ''', (user_id,))
        
        inventory_stats = dict(cursor.fetchone()) if cursor.fetchone() else {}
        
        # Получаем ежедневный бонус
        cursor.execute('''
            SELECT bonus_date, streak 
            FROM daily_bonuses 
            WHERE user_id = ?
            ORDER BY bonus_date DESC
            LIMIT 1
        ''', (user_id,))
        
        daily_bonus = dict(cursor.fetchone()) if cursor.fetchone() else {}
        
        conn.close()
        
        return {
            **stats,
            **inventory_stats,
            "last_daily_bonus": daily_bonus.get("bonus_date"),
            "daily_streak": daily_bonus.get("streak", 0),
            "inventory_count": inventory_stats.get("total_items", 0),
            "inventory_value": inventory_stats.get("total_value", 0)
        }
    
    def get_inventory(self, user_id: int) -> List[Dict[str, Any]]:
        """Получает инвентарь пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM inventory 
            WHERE user_id = ? AND status = 'available'
            ORDER BY created_at DESC
        ''', (user_id,))
        
        inventory = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return inventory
    
    def add_to_inventory(self, user_id: int, item_data: Dict[str, Any]) -> int:
        """Добавляет предмет в инвентарь"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO inventory 
            (user_id, item_name, item_type, item_rarity, item_price, 
             case_price, steam_market_id, steam_inspect_link)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            item_data.get("name"),
            item_data.get("type"),
            item_data.get("rarity"),
            item_data.get("price"),
            item_data.get("case_price"),
            item_data.get("steam_market_id"),
            item_data.get("steam_inspect_link")
        ))
        
        item_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return item_id
    
    def create_withdrawal_request(self, user_id: int, item_id: int, 
                                 trade_link: str) -> bool:
        """Создает запрос на вывод"""
        # Сначала проверяем валидность трейд ссылки
        validation = self.validate_trade_link(trade_link)
        if not validation["valid"]:
            return False
        
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            # Проверяем, что предмет принадлежит пользователю и доступен
            cursor.execute('''
                SELECT * FROM inventory 
                WHERE id = ? AND user_id = ? AND status = 'available'
            ''', (item_id, user_id))
            
            if not cursor.fetchone():
                return False
            
            # Создаем запрос на вывод
            cursor.execute('''
                INSERT INTO withdrawal_requests 
                (user_id, item_id, trade_link)
                VALUES (?, ?, ?)
            ''', (user_id, item_id, trade_link))
            
            # Меняем статус предмета
            cursor.execute('''
                UPDATE inventory SET 
                status = 'withdrawn',
                withdraw_request_date = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (item_id,))
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            logger.error(f"❌ Ошибка создания запроса на вывод: {e}")
            conn.rollback()
            conn.close()
            return False

# Глобальный экземпляр базы данных
db = Database()
