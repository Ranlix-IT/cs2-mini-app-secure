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
