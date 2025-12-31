// Конфигурация API
const API_BASE_URL = "https://cs2-mini-app.vercel.app/"; // Замените на URL вашего API сервера

// Функция для отправки запросов к API
async function apiRequest(endpoint, method = 'GET', data = null, initData = null) {
    try {
        const headers = {
            'Content-Type': 'application/json',
        };
        
        // Добавляем данные аутентификации Telegram
        if (initData) {
            headers['Authorization'] = `tma ${initData}`;
        }
        
        const config = {
            method: method,
            headers: headers,
        };
        
        if (data && (method === 'POST' || method === 'PUT')) {
            config.body = JSON.stringify(data);
        }
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
        
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

// Обновленная функция загрузки данных пользователя
async function loadUserData() {
    try {
        showLoading();
        
        const initData = tg.initData;
        const response = await apiRequest('/api/user', 'GET', null, initData);
        
        if (response.success) {
            appState.user = {
                id: response.user.id,
                firstName: response.user.first_name,
                lastName: response.user.last_name || '',
                username: response.user.username || '',
            };
            
            appState.balance = response.user.balance;
            appState.inventory = response.user.inventory || [];
            appState.dailyBonusAvailable = response.daily_bonus_available;
            appState.referralCode = response.user.referral_code;
            appState.tradeLink = response.user.trade_link;
            appState.referralsCount = response.user.referrals_count;
            
            updateUI();
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Ошибка загрузки данных', 'Попробуйте позже', 'error');
    }
}

// Обновленная функция открытия кейса
async function openCase(price) {
    const initData = tg.initData;
    
    if (appState.balance < price) {
        showToast('Недостаточно баллов!', `Нужно: ${price} баллов`, 'error');
        return;
    }
    
    // Показываем анимацию открытия
    const caseOpening = document.getElementById('case-opening');
    const openingText = document.getElementById('opening-text');
    const wonItem = document.getElementById('won-item');
    
    caseOpening.classList.remove('hidden');
    openingText.textContent = 'Открываем кейс...';
    
    try {
        const response = await apiRequest('/api/open-case', 'POST', { price: price }, initData);
        
        if (response.success) {
            openingText.textContent = 'Поздравляем!';
            wonItem.innerHTML = `
                <i class="fas fa-trophy"></i>
                <div>${response.item}</div>
                <small>+${response.item_price} баллов</small>
            `;
            
            // Обновляем состояние
            appState.balance = response.new_balance;
            appState.inventory = response.inventory;
            
            // Обновляем UI
            updateUI();
            
            showToast('Кейс открыт!', `Вы получили: ${response.item}`, 'success');
        } else {
            openingText.textContent = 'Ошибка';
            wonItem.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <div>${response.error || 'Не удалось открыть кейс'}</div>
            `;
            
            showToast('Ошибка', response.error || 'Не удалось открыть кейс', 'error');
        }
        
    } catch (error) {
        console.error('Error opening case:', error);
        openingText.textContent = 'Ошибка соединения';
        wonItem.innerHTML = '<i class="fas fa-exclamation-triangle"></i><div>Попробуйте еще раз</div>';
        showToast('Ошибка', 'Не удалось открыть кейс', 'error');
    }
}

// Обновленная функция получения ежедневного бонуса
async function claimDailyBonus() {
    const initData = tg.initData;
    
    try {
        const response = await apiRequest('/api/daily-bonus', 'POST', {}, initData);
        
        if (response.success) {
            appState.balance = response.new_balance;
            appState.dailyBonusAvailable = false;
            
            // Обновляем UI
            updateUI();
            updateBonusTimer();
            
            showToast('Бонус получен!', `+${response.bonus} баллов`, 'success');
        } else {
            showToast('Бонус уже получен', 'Возвращайтесь завтра!', 'warning');
        }
        
    } catch (error) {
        console.error('Error claiming bonus:', error);
        showToast('Ошибка', 'Не удалось получить бонус', 'error');
    }
}

// Обновленная функция активации промокода
async function activatePromoCode() {
    const input = document.getElementById('promo-code-input');
    const code = input.value.trim().toUpperCase();
    const initData = tg.initData;
    
    if (!code) {
        showToast('Введите промокод', '', 'warning');
        input.focus();
        return;
    }
    
    try {
        showLoading();
        
        const response = await apiRequest('/api/activate-promo', 'POST', { promo_code: code }, initData);
        
        if (response.success) {
            appState.balance = response.new_balance;
            appState.usedPromoCodes.push(code);
            
            // Обновляем UI
            updateUI();
            
            // Очищаем поле ввода
            input.value = '';
            
            showToast('Промокод активирован!', `+${response.points} баллов`, 'success');
        } else {
            showToast('Ошибка', response.error || 'Не удалось активировать промокод', 'error');
        }
        
    } catch (error) {
        console.error('Error activating promo:', error);
        showToast('Ошибка', 'Не удалось активировать промокод', 'error');
    } finally {
        hideLoading();
    }
}

// Обновленная функция вывода предмета
async function withdrawItem(itemId) {
    const initData = tg.initData;
    
    if (!confirm('Вы уверены, что хотите вывести этот предмет?')) {
        return;
    }
    
    try {
        showLoading();
        
        const response = await apiRequest('/api/withdraw-item', 'POST', { item_id: itemId }, initData);
        
        if (response.success) {
            if (response.requires_trade_link) {
                // Запрашиваем трейд ссылку
                showToast('Требуется трейд ссылка', 'Укажите трейд ссылку для вывода', 'warning');
                openSection('profile'); // Переходим в профиль
                return;
            }
            
            // Обновляем инвентарь
            appState.inventory = appState.inventory.filter(item => item.id !== itemId);
            
            // Обновляем UI
            updateUI();
            
            showToast('Запрос отправлен', 'Администратор обработает ваш вывод', 'success');
        } else {
            showToast('Ошибка', response.error || 'Не удалось отправить запрос', 'error');
        }
        
    } catch (error) {
        console.error('Error withdrawing item:', error);
        showToast('Ошибка', 'Не удалось отправить запрос', 'error');
    } finally {
        hideLoading();
    }
}

// Функция установки трейд ссылки
async function setTradeLink(tradeLink) {
    const initData = tg.initData;
    
    try {
        const response = await apiRequest('/api/set-trade-link', 'POST', { trade_link: tradeLink }, initData);
        
        if (response.success) {
            appState.tradeLink = tradeLink;
            updateUI();
            showToast('Успешно', 'Трейд ссылка сохранена', 'success');
            return true;
        } else {
            showToast('Ошибка', response.error || 'Неверный формат ссылки', 'error');
            return false;
        }
        
    } catch (error) {
        console.error('Error setting trade link:', error);
        showToast('Ошибка', 'Не удалось сохранить ссылку', 'error');
        return false;
    }
}

// Функция загрузки доступных промокодов
async function loadAvailablePromos() {
    try {
        const response = await apiRequest('/api/available-promos', 'GET');
        
        if (response.success) {
            // Обновляем список промокодов в UI
            const promoList = document.querySelector('.promo-list');
            if (promoList) {
                promoList.innerHTML = response.promos.map(promo => `
                    <div class="promo-item">
                        <span class="promo-code">${promo.code}</span>
                        <span class="promo-reward">+${promo.points} баллов</span>
                    </div>
                `).join('');
            }
        }
        
    } catch (error) {
        console.error('Error loading promos:', error);
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    // Инициализируем Telegram Web App
    initializeTelegramApp();
    
    // Загружаем данные пользователя
    loadUserData();
    
    // Загружаем промокоды
    loadAvailablePromos();
    
    // Настраиваем обработчики событий
    setupEventListeners();
});
