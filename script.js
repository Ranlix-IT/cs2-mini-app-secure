// Telegram Web App SDK
const tg = window.Telegram.WebApp;

// Конфигурация API
const API_BASE_URL = "https://cs2-mini-app-api.onrender.com"; // Замените на ваш API URL

// Состояние приложения
let appState = {
    user: null,
    balance: 0,
    inventory: [],
    dailyBonusAvailable: true,
    lastBonusTime: null,
    usedPromoCodes: [],
    referralCode: "",
    tradeLink: "",
    referralsCount: 0
};

// Инициализация приложения
document.addEventListener('DOMContentLoaded', function() {
    // Инициализируем Telegram Web App
    initializeTelegramApp();
    
    // Настраиваем тему
    setupTheme();
    
    // Загружаем данные пользователя
    loadUserData();
    
    // Загружаем доступные промокоды
    loadAvailablePromos();
    
    // Настраиваем обработчики событий
    setupEventListeners();
    
    // Обновляем таймер бонуса
    updateBonusTimer();
    setInterval(updateBonusTimer, 1000);
});

// Инициализация Telegram Web App
function initializeTelegramApp() {
    tg.ready();
    tg.expand(); // Раскрываем на весь экран
    
    // Получаем данные пользователя из Telegram
    const initData = tg.initDataUnsafe;
    
    if (initData.user) {
        appState.user = {
            id: initData.user.id,
            firstName: initData.user.first_name,
            lastName: initData.user.last_name || '',
            username: initData.user.username || '',
            photoUrl: initData.user.photo_url || null,
            languageCode: initData.user.language_code || 'ru'
        };
        
        updateUserInfo();
    }
    
    // Настройка основной кнопки
    tg.MainButton.setParams({
        text: 'Открыть бота',
        color: '#667eea',
        text_color: '#ffffff'
    });
    
    // Обработчики событий Telegram
    tg.onEvent('themeChanged', setupTheme);
    tg.onEvent('viewportChanged', () => tg.expand());
    tg.onEvent('mainButtonClicked', () => {
        tg.sendData(JSON.stringify({ action: 'open_bot' }));
    });
}

// Настройка темы
function setupTheme() {
    const isDark = tg.colorScheme === 'dark';
    document.body.classList.toggle('dark-theme', isDark);
    
    // Устанавливаем цвета из Telegram
    tg.setHeaderColor('#667eea');
    tg.setBackgroundColor('#1a202c');
}

// ===== API ФУНКЦИИ =====

// Функция для отправки запросов к API
async function apiRequest(endpoint, method = 'GET', data = null) {
    try {
        const headers = {
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': tg.initData || ''
        };
        
        const config = {
            method: method,
            headers: headers,
        };
        
        if (data && (method === 'POST' || method === 'PUT')) {
            config.body = JSON.stringify(data);
        }
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        return await response.json();
        
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

// Загрузка данных пользователя
async function loadUserData() {
    try {
        showLoading();
        
        const response = await apiRequest('/api/user');
        
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
            
            updateUserInfo();
            updateUI();
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('Error loading user data:', error);
        
        // Fallback к тестовым данным если API недоступен
        useTestData();
        
        showToast('API недоступен', 'Используем демо-режим', 'warning');
    }
}

// Использование тестовых данных
function useTestData() {
    appState.user = {
        id: 123456789,
        firstName: "Демо",
        lastName: "Пользователь",
        username: "demo_user"
    };
    
    appState.balance = 1500;
    appState.inventory = [
        { 
            id: 1, 
            name: "Наклейка | ENCE", 
            price: 500, 
            type: "sticker",
            image: "https://via.placeholder.com/64"
        },
        { 
            id: 2, 
            name: "FAMAS | Колония", 
            price: 3000, 
            type: "weapon",
            image: "https://via.placeholder.com/64"
        },
        { 
            id: 3, 
            name: "Five-SeveN | Хладагент", 
            price: 5000, 
            type: "weapon",
            image: "https://via.placeholder.com/64"
        }
    ];
    appState.dailyBonusAvailable = true;
    appState.referralCode = "ref_123456789";
    appState.tradeLink = "";
    appState.referralsCount = 0;
    
    updateUserInfo();
    updateUI();
}

// Загрузка доступных промокодов
async function loadAvailablePromos() {
    try {
        const response = await apiRequest('/api/available-promos');
        
        if (response.success && response.promos) {
            // Обновляем список промокодов в UI
            const promoList = document.querySelector('.promo-list');
            if (promoList) {
                promoList.innerHTML = response.promos.map(promo => `
                    <div class="promo-item">
                        <span class="promo-code">${promo.code}</span>
                        <span class="promo-reward">+${promo.points} баллов</span>
                        <span class="promo-uses">${promo.remaining_uses === "∞" ? "∞" : `осталось: ${promo.remaining_uses}`}</span>
                    </div>
                `).join('');
            }
        }
        
    } catch (error) {
        console.error('Error loading promos:', error);
        
        // Fallback тестовые промокоды
        const promoList = document.querySelector('.promo-list');
        if (promoList) {
            promoList.innerHTML = `
                <div class="promo-item">
                    <span class="promo-code">MINI1</span>
                    <span class="promo-reward">+50 баллов</span>
                    <span class="promo-uses">∞</span>
                </div>
                <div class="promo-item">
                    <span class="promo-code">1JKLM</span>
                    <span class="promo-reward">+100 баллов</span>
                    <span class="promo-uses">осталось: 51</span>
                </div>
                <div class="promo-item">
                    <span class="promo-code">RWTUBE</span>
                    <span class="promo-reward">+250 баллов</span>
                    <span class="promo-uses">осталось: 10</span>
                </div>
            `;
        }
    }
}

// ===== ОСНОВНЫЕ ФУНКЦИИ =====

// Обновление информации о пользователе
function updateUserInfo() {
    if (!appState.user) return;
    
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');
    const menuUsername = document.getElementById('menu-username');
    const menuAvatar = document.getElementById('menu-avatar');
    
    // Обновляем имя
    const displayName = appState.user.firstName + (appState.user.lastName ? ' ' + appState.user.lastName : '');
    if (userName) userName.textContent = displayName;
    if (menuUsername) menuUsername.textContent = displayName;
    
    // Обновляем аватар
    if (appState.user.photoUrl) {
        if (userAvatar) {
            userAvatar.innerHTML = `<img src="${appState.user.photoUrl}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
        if (menuAvatar) {
            menuAvatar.innerHTML = `<img src="${appState.user.photoUrl}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
    }
}

// Обновление всего UI
function updateUI() {
    updateBalance();
    updateInventory();
    updateBonusButton();
    updateMenuBalance();
    updateStats();
}

// Обновление баланса
function updateBalance() {
    const balanceElement = document.getElementById('balance');
    const userBalanceElement = document.getElementById('user-balance');
    
    if (balanceElement) {
        balanceElement.textContent = appState.balance.toLocaleString();
    }
    
    if (userBalanceElement) {
        userBalanceElement.textContent = `${appState.balance.toLocaleString()} баллов`;
    }
}

// Обновление баланса в меню
function updateMenuBalance() {
    const menuBalance = document.getElementById('menu-balance');
    if (menuBalance) {
        menuBalance.textContent = `${appState.balance.toLocaleString()} баллов`;
    }
}

// Обновление статистики
function updateStats() {
    const totalItems = document.getElementById('total-items');
    const totalValue = document.getElementById('total-value');
    
    if (totalItems) {
        totalItems.textContent = appState.inventory.length;
    }
    
    if (totalValue) {
        const total = appState.inventory.reduce((sum, item) => sum + item.price, 0);
        totalValue.textContent = total.toLocaleString();
    }
}

// Обновление инвентаря
function updateInventory(filter = 'all') {
    const inventoryList = document.getElementById('inventory-list');
    
    if (!inventoryList) return;
    
    // Фильтрация предметов
    let filteredItems = appState.inventory;
    if (filter !== 'all') {
        filteredItems = appState.inventory.filter(item => item.type === filter);
    }
    
    if (filteredItems.length === 0) {
        inventoryList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-box-open"></i>
                </div>
                <h3>Инвентарь пуст</h3>
                <p>Откройте кейсы, чтобы получить предметы</p>
                <button class="btn-primary" onclick="openSection('cases')">
                    <i class="fas fa-box-open"></i> Открыть кейс
                </button>
            </div>
        `;
        return;
    }
    
    // Создаем список предметов
    inventoryList.innerHTML = filteredItems.map(item => `
        <div class="inventory-item" data-id="${item.id}">
            <div class="item-info">
                <div class="item-name">${item.name}</div>
                <div class="item-price">
                    <i class="fas fa-coins"></i> ${item.price.toLocaleString()} баллов
                </div>
            </div>
            <button class="withdraw-btn" onclick="withdrawItem(${item.id})" title="Вывести предмет">
                <i class="fas fa-download"></i> Вывести
            </button>
        </div>
    `).join('');
}

// Фильтрация инвентаря
function filterInventory(filter) {
    // Обновляем активную кнопку фильтра
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Обновляем список
    updateInventory(filter);
}

// Обновление кнопки бонуса
function updateBonusButton() {
    const bonusBtn = document.getElementById('daily-bonus-btn');
    if (!bonusBtn) return;
    
    if (appState.dailyBonusAvailable) {
        bonusBtn.innerHTML = '<i class="fas fa-gift"></i> Забрать';
        bonusBtn.onclick = claimDailyBonus;
        bonusBtn.disabled = false;
        bonusBtn.classList.remove('disabled');
    } else {
        bonusBtn.innerHTML = '<i class="fas fa-clock"></i> Уже получено';
        bonusBtn.onclick = null;
        bonusBtn.disabled = true;
        bonusBtn.classList.add('disabled');
    }
}

// Обновление таймера бонуса
function updateBonusTimer() {
    const timerElement = document.getElementById('timer');
    if (!timerElement || !appState.lastBonusTime) return;
    
    const now = Date.now();
    const timeSinceLastBonus = now - appState.lastBonusTime;
    const hoursSinceLastBonus = Math.floor(timeSinceLastBonus / (1000 * 60 * 60));
    
    if (hoursSinceLastBonus >= 24) {
        appState.dailyBonusAvailable = true;
        updateBonusButton();
        timerElement.textContent = 'Доступно сейчас!';
        return;
    }
    
    // Вычисляем оставшееся время
    const remainingTime = 24 * 60 * 60 * 1000 - timeSinceLastBonus;
    const hours = Math.floor(remainingTime / (1000 * 60 * 60));
    const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
    
    timerElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// ===== ОСНОВНЫЕ ДЕЙСТВИЯ =====

// Открытие секций
function openSection(section) {
    // Скрываем все секции
    document.querySelectorAll('.page-section').forEach(el => {
        el.classList.add('hidden');
    });
    
    // Показываем выбранную секцию
    const targetSection = document.getElementById(`${section}-section`);
    if (targetSection) {
        targetSection.classList.remove('hidden');
        // Прокручиваем в начало
        targetSection.scrollTop = 0;
    }
    
    // Закрываем меню
    toggleMenu(false);
    
    // Показываем/скрываем основную кнопку
    if (section === 'main') {
        tg.MainButton.hide();
    } else {
        tg.MainButton.setText('На главную');
        tg.MainButton.onClick(() => backToMain());
        tg.MainButton.show();
    }
}

// Назад в главное меню
function backToMain() {
    openSection('main');
}

// Открытие кейса
async function openCase(price) {
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
        const response = await apiRequest('/api/open-case', 'POST', { price: price });
        
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
            
            // Отправляем данные в бота
            sendToBot('case_opened', {
                case_price: price,
                won_item: response.item,
                new_balance: appState.balance
            });
            
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
        
        // Fallback к локальной логике
        openCaseLocal(price, caseOpening, openingText, wonItem);
    }
}

// Локальное открытие кейса (fallback)
function openCaseLocal(price, caseOpening, openingText, wonItem) {
    // Имитируем задержку
    setTimeout(() => {
        // Тестовые предметы
        const testItems = {
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
        };
        
        const availableItems = testItems[price] || ["Наклейка | ENCE |"];
        const wonItemName = availableItems[Math.floor(Math.random() * availableItems.length)];
        const itemPrice = Math.floor(price * 0.7);
        
        // Обновляем состояние
        appState.balance -= price;
        appState.inventory.push({
            id: Date.now(),
            name: wonItemName,
            price: itemPrice,
            type: wonItemName.includes('Наклейка') ? 'sticker' : 
                  wonItemName.includes('FAMAS') || wonItemName.includes('UMP') || wonItemName.includes('Five-SeveN') ? 'weapon' : 'other',
        });
        
        // Показываем выигрыш
        openingText.textContent = 'Поздравляем!';
        wonItem.innerHTML = `
            <i class="fas fa-trophy"></i>
            <div>${wonItemName}</div>
            <small>+${itemPrice} баллов</small>
        `;
        
        // Обновляем UI
        updateUI();
        
        // Отправляем данные в бота
        sendToBot('case_opened', {
            case_price: price,
            won_item: wonItemName,
            new_balance: appState.balance
        });
        
        showToast('Кейс открыт!', `Вы получили: ${wonItemName}`, 'success');
    }, 2000);
}

// Закрытие анимации открытия кейса
function closeCaseOpening() {
    document.getElementById('case-opening').classList.add('hidden');
}

// Получение ежедневного бонуса
async function claimDailyBonus() {
    if (!appState.dailyBonusAvailable) {
        showToast('Бонус уже получен', 'Возвращайтесь завтра!', 'warning');
        return;
    }
    
    try {
        const response = await apiRequest('/api/daily-bonus', 'POST');
        
        if (response.success) {
            appState.balance = response.new_balance;
            appState.dailyBonusAvailable = false;
            appState.lastBonusTime = Date.now();
            
            // Обновляем UI
            updateUI();
            updateBonusTimer();
            
            // Анимация получения бонуса
            const bonusBtn = document.getElementById('daily-bonus-btn');
            if (bonusBtn) {
                bonusBtn.innerHTML = '<i class="fas fa-check"></i> Получено!';
                bonusBtn.style.background = '#48bb78';
                setTimeout(() => updateBonusButton(), 2000);
            }
            
            // Отправляем данные в бота
            sendToBot('bonus_claimed', {
                amount: response.bonus,
                new_balance: appState.balance
            });
            
            showToast('Бонус получен!', `+${response.bonus} баллов`, 'success');
        } else {
            showToast('Бонус уже получен', 'Возвращайтесь завтра!', 'warning');
        }
        
    } catch (error) {
        console.error('Error claiming bonus:', error);
        
        // Fallback к локальной логике
        claimDailyBonusLocal();
    }
}

// Локальное получение бонуса (fallback)
function claimDailyBonusLocal() {
    const bonusAmount = 50;
    appState.balance += bonusAmount;
    appState.dailyBonusAvailable = false;
    appState.lastBonusTime = Date.now();
    
    // Обновляем UI
    updateUI();
    updateBonusTimer();
    
    // Анимация получения бонуса
    const bonusBtn = document.getElementById('daily-bonus-btn');
    if (bonusBtn) {
        bonusBtn.innerHTML = '<i class="fas fa-check"></i> Получено!';
        bonusBtn.style.background = '#48bb78';
        setTimeout(() => updateBonusButton(), 2000);
    }
    
    // Отправляем данные в бота
    sendToBot('bonus_claimed', {
        amount: bonusAmount,
        new_balance: appState.balance
    });
    
    showToast('Бонус получен!', `+${bonusAmount} баллов`, 'success');
}

// Вывод предмета
async function withdrawItem(itemId) {
    const item = appState.inventory.find(i => i.id === itemId);
    if (!item) {
        showToast('Предмет не найден', '', 'error');
        return;
    }
    
    if (!confirm(`Вывести предмет "${item.name}"?`)) {
        return;
    }
    
    try {
        showLoading();
        
        const response = await apiRequest('/api/withdraw-item', 'POST', { item_id: itemId });
        
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
            
            // Отправляем данные в бота
            sendToBot('item_withdrawn', {
                item_name: item.name,
                item_price: item.price,
                items_remaining: appState.inventory.length
            });
            
            showToast('Запрос отправлен', 'Администратор обработает ваш вывод', 'success');
        } else {
            showToast('Ошибка', response.error || 'Не удалось отправить запрос', 'error');
        }
        
    } catch (error) {
        console.error('Error withdrawing item:', error);
        
        // Fallback к локальной логике
        withdrawItemLocal(itemId, item);
    } finally {
        hideLoading();
    }
}

// Локальный вывод предмета (fallback)
function withdrawItemLocal(itemId, item) {
    // Проверяем трейд ссылку
    if (!appState.tradeLink) {
        showToast('Требуется трейд ссылка', 'Укажите трейд ссылку для вывода', 'warning');
        openSection('profile');
        return;
    }
    
    // Удаляем предмет из инвентаря
    appState.inventory = appState.inventory.filter(i => i.id !== itemId);
    
    // Обновляем UI
    updateUI();
    
    // Отправляем данные в бота
    sendToBot('item_withdrawn', {
        item_name: item.name,
        item_price: item.price,
        items_remaining: appState.inventory.length
    });
    
    showToast('Запрос отправлен', 'Администратор обработает ваш вывод', 'success');
}

// Вывод всех предметов
async function withdrawAllItems() {
    if (appState.inventory.length === 0) {
        showToast('Инвентарь пуст', 'Нет предметов для вывода', 'warning');
        return;
    }
    
    const totalValue = appState.inventory.reduce((sum, item) => sum + item.price, 0);
    
    if (!confirm(`Вывести все предметы (${appState.inventory.length} шт.) на сумму ${totalValue} баллов?`)) {
        return;
    }
    
    try {
        showLoading();
        
        // Отправляем запрос на вывод всех предметов
        // Note: Для этого нужно добавить endpoint в API
        
        // Временно используем последовательный вывод
        for (const item of appState.inventory) {
            try {
                await apiRequest('/api/withdraw-item', 'POST', { item_id: item.id });
            } catch (error) {
                console.error(`Error withdrawing item ${item.id}:`, error);
            }
        }
        
        // Очищаем инвентарь
        appState.inventory = [];
        
        // Обновляем UI
        updateUI();
        
        // Отправляем данные в бота
        sendToBot('all_items_withdrawn', {
            items_count: appState.inventory.length,
            total_value: totalValue
        });
        
        showToast('Запросы отправлены', `Вывод ${appState.inventory.length} предметов`, 'success');
        
    } catch (error) {
        console.error('Error withdrawing all items:', error);
        
        // Fallback к локальной логике
        withdrawAllItemsLocal(totalValue);
    } finally {
        hideLoading();
    }
}

// Локальный вывод всех предметов (fallback)
function withdrawAllItemsLocal(totalValue) {
    // Проверяем трейд ссылку
    if (!appState.tradeLink) {
        showToast('Требуется трейд ссылка', 'Укажите трейд ссылку для вывода', 'warning');
        openSection('profile');
        return;
    }
    
    // Отправляем данные в бота
    sendToBot('all_items_withdrawn', {
        items_count: appState.inventory.length,
        total_value: totalValue,
        items: appState.inventory.map(item => item.name)
    });
    
    // Очищаем инвентарь
    appState.inventory = [];
    
    // Обновляем UI
    updateUI();
    
    showToast('Запрос отправлен', `Вывод всех предметов`, 'success');
}

// Активация промокода
async function activatePromoCode() {
    const input = document.getElementById('promo-code-input');
    const code = input.value.trim().toUpperCase();
    
    if (!code) {
        showToast('Введите промокод', '', 'warning');
        input.focus();
        return;
    }
    
    if (appState.usedPromoCodes.includes(code)) {
        showToast('Промокод уже использован', '', 'error');
        input.value = '';
        return;
    }
    
    try {
        showLoading();
        
        const response = await apiRequest('/api/activate-promo', 'POST', { promo_code: code });
        
        if (response.success) {
            appState.balance = response.new_balance;
            appState.usedPromoCodes.push(code);
            
            // Обновляем UI
            updateUI();
            
            // Очищаем поле ввода
            input.value = '';
            
            // Отправляем данные в бота
            sendToBot('promo_activated', {
                promo_code: code,
                points_received: response.points,
                new_balance: appState.balance
            });
            
            showToast('Промокод активирован!', `+${response.points} баллов`, 'success');
        } else {
            showToast('Ошибка', response.error || 'Не удалось активировать промокод', 'error');
        }
        
    } catch (error) {
        console.error('Error activating promo:', error);
        
        // Fallback к локальной логике
        activatePromoCodeLocal(code, input);
    } finally {
        hideLoading();
    }
}

// Локальная активация промокода (fallback)
function activatePromoCodeLocal(code, input) {
    // Проверка тестовых промокодов
    const testPromos = {
        'MINI1': 50,
        '1JKLM': 100,
        'RWTUBE': 250,
        'INSTRW': 250,
        'VKRAN': 250
    };
    
    if (!testPromos[code]) {
        showToast('Неверный промокод', '', 'error');
        input.value = '';
        return;
    }
    
    const points = testPromos[code];
    appState.balance += points;
    appState.usedPromoCodes.push(code);
    
    // Обновляем UI
    updateUI();
    
    // Очищаем поле ввода
    input.value = '';
    
    // Отправляем данные в бота
    sendToBot('promo_activated', {
        promo_code: code,
        points_received: points,
        new_balance: appState.balance
    });
    
    showToast('Промокод активирован!', `+${points} баллов`, 'success');
}

// Установка трейд ссылки
async function setTradeLink() {
    const input = document.getElementById('trade-link-input');
    const tradeLink = input ? input.value.trim() : '';
    
    if (!tradeLink) {
        showToast('Введите трейд ссылку', '', 'warning');
        return;
    }
    
    // Простая валидация
    if (!tradeLink.includes('steamcommunity.com/tradeoffer/new/')) {
        showToast('Неверный формат', 'Это не похоже на трейд ссылку Steam', 'error');
        return;
    }
    
    try {
        const response = await apiRequest('/api/set-trade-link', 'POST', { trade_link: tradeLink });
        
        if (response.success) {
            appState.tradeLink = tradeLink;
            updateUI();
            
            if (input) input.value = '';
            
            showToast('Успешно', 'Трейд ссылка сохранена', 'success');
            return true;
        } else {
            showToast('Ошибка', response.error || 'Неверный формат ссылки', 'error');
            return false;
        }
        
    } catch (error) {
        console.error('Error setting trade link:', error);
        
        // Fallback к локальной логике
        return setTradeLinkLocal(tradeLink, input);
    }
}

// Локальная установка трейд ссылки (fallback)
function setTradeLinkLocal(tradeLink, input) {
    appState.tradeLink = tradeLink;
    updateUI();
    
    if (input) input.value = '';
    
    showToast('Успешно', 'Трейд ссылка сохранена', 'success');
    return true;
}

// Копирование реферальной ссылки
function copyReferralLink() {
    if (!appState.user || !appState.referralCode) {
        showToast('Ошибка', 'Не удалось получить реферальную ссылку', 'error');
        return;
    }
    
    const botUsername = 'MeteoHinfoBot'; // Замените на username вашего бота
    const referralLink = `https://t.me/${botUsername}?start=${appState.referralCode}`;
    
    // Используем Clipboard API
    if (navigator.clipboard) {
        navigator.clipboard.writeText(referralLink)
            .then(() => {
                showToast('Ссылка скопирована', 'Отправьте ее друзьям', 'success');
                sendToBot('referral_link_copied');
            })
            .catch(err => {
                fallbackCopy(referralLink);
            });
    } else {
        fallbackCopy(referralLink);
    }
}

// Fallback для копирования
function fallbackCopy(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
        document.execCommand('copy');
        showToast('Ссылка скопирована', 'Отправьте ее друзьям', 'success');
        sendToBot('referral_link_copied');
    } catch (err) {
        showToast('Ошибка копирования', 'Скопируйте ссылку вручную', 'error');
    }
    
    document.body.removeChild(textArea);
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

// Боковое меню
function toggleMenu(show) {
    const menu = document.getElementById('side-menu');
    if (show !== undefined) {
        menu.classList.toggle('active', show);
    } else {
        menu.classList.toggle('active');
    }
    
    // Блокируем/разблокируем прокрутку
    if (menu.classList.contains('active')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
}

// Закрытие приложения
function closeApp() {
    tg.close();
}

// Отправка данных в бота
function sendToBot(action, data = {}) {
    tg.sendData(JSON.stringify({
        action: action,
        user_id: appState.user?.id,
        timestamp: Date.now(),
        ...data
    }));
}

// Показать уведомление
function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas fa-${getToastIcon(type)}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;
    
    container.appendChild(toast);
    
    // Автоматическое удаление
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Получение иконки для уведомления
function getToastIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        case 'info': return 'info-circle';
        default: return 'info-circle';
    }
}

// Показать загрузку
function showLoading() {
    document.body.classList.add('loading');
}

// Скрыть загрузку
function hideLoading() {
    document.body.classList.remove('loading');
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Закрытие меню при клике вне его
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('side-menu');
        if (menu && menu.classList.contains('active') && !e.target.closest('.menu-content') && !e.target.closest('.menu-btn')) {
            toggleMenu(false);
        }
    });
    
    // Обработка нажатия Enter в поле промокода
    const promoInput = document.getElementById('promo-code-input');
    if (promoInput) {
        promoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                activatePromoCode();
            }
        });
    }
    
    // Обработка нажатия Enter в поле трейд ссылки
    const tradeLinkInput = document.getElementById('trade-link-input');
    if (tradeLinkInput) {
        tradeLinkInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                setTradeLink();
            }
        });
    }
}

// Инициализация при загрузке страницы
window.onload = function() {
    // Добавляем анимацию появления
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.3s ease';
    
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);
};

// Экспорт функций для использования в HTML
window.openSection = openSection;
window.backToMain = backToMain;
window.openCase = openCase;
window.closeCaseOpening = closeCaseOpening;
window.claimDailyBonus = claimDailyBonus;
window.withdrawItem = withdrawItem;
window.withdrawAllItems = withdrawAllItems;
window.activatePromoCode = activatePromoCode;
window.copyReferralLink = copyReferralLink;
window.setTradeLink = setTradeLink;
window.filterInventory = filterInventory;
window.toggleMenu = toggleMenu;
window.closeApp = closeApp;
