// Telegram Web App SDK
let tg;
let appState = {
    user: null,
    balance: 1000, // Начальный баланс для демо
    inventory: [],
    dailyBonusAvailable: true,
    referralCode: "",
    tradeLink: "",
    referralsCount: 0
};

const API_BASE_URL = "https://cs2-mini-app.onrender.com";

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 CS2 Skin Bot запускается...");
    
    initializeTelegramApp();
    setupEventListeners();
    updateBonusTimer();
    setInterval(updateBonusTimer, 1000);
    
    // Сразу обновляем UI для демо
    updateUserInfo();
    updateInventoryUI();
    updateProfileInfo();
    
    // Тестируем API соединение
    setTimeout(testAPIConnection, 1000);
});

// ===== TELEGRAM ИНИЦИАЛИЗАЦИЯ =====
function initializeTelegramApp() {
    try {
        if (typeof window.Telegram === 'undefined' || !window.Telegram.WebApp) {
            console.error("❌ Telegram SDK не загружен");
            setTimeout(initializeTelegramApp, 100);
            return;
        }
        
        tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        
        console.log('📱 Telegram WebApp версия:', tg.version);
        console.log('📱 Telegram initDataUnsafe:', tg.initDataUnsafe);
        
        // Пытаемся получить данные пользователя
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            const userData = tg.initDataUnsafe.user;
            appState.user = {
                id: userData.id,
                firstName: userData.first_name || 'Пользователь',
                lastName: userData.last_name || '',
                username: userData.username || `user_${userData.id}`
            };
            
            console.log("✅ Пользователь Telegram авторизован:", appState.user);
            
            // Загружаем реальные данные с сервера
            loadUserData();
        } else {
            console.warn("⚠️ Данные пользователя Telegram не получены");
            console.log("📱 Полный initDataUnsafe:", JSON.stringify(tg.initDataUnsafe));
            useTestData();
        }
        
    } catch (error) {
        console.error('❌ Ошибка инициализации Telegram:', error);
        useTestData();
    }
}

// ===== ТЕСТОВЫЕ ДАННЫЕ =====
function useTestData() {
    console.log("🔧 Используем тестовые данные");
    
    appState.user = {
        id: 1003215844,
        firstName: 'Тестовый',
        lastName: 'Пользователь',
        username: 'test_user'
    };
    
    appState.balance = 1500;
    appState.inventory = [
        {
            id: '1',
            name: 'Наклейка | ENCE |',
            price: 250,
            type: 'sticker',
            rarity: 'common',
            received_at: Date.now() / 1000
        },
        {
            id: '2',
            name: 'FAMAS | Колония',
            price: 500,
            type: 'weapon',
            rarity: 'uncommon',
            received_at: Date.now() / 1000
        },
        {
            id: '3',
            name: 'Five-SeveN | Хладагент',
            price: 750,
            type: 'weapon',
            rarity: 'rare',
            received_at: Date.now() / 1000
        }
    ];
    
    appState.dailyBonusAvailable = true;
    appState.referralCode = `ref_${appState.user.id}_${Date.now()}`;
    appState.referralsCount = 3;
    appState.tradeLink = "https://steamcommunity.com/tradeoffer/new/partner=123456789";
    
    updateUserInfo();
    updateInventoryUI();
    updateProfileInfo();
    
    showToast('Демо-режим', 'Используются тестовые данные', 'info');
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====
function setupEventListeners() {
    console.log("🔧 Настройка обработчиков событий...");
    
    // Кнопка меню
    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) {
        menuBtn.addEventListener('click', toggleMenu);
    }
    
    // Кнопка закрытия меню
    const menuCloseBtn = document.getElementById('menu-close-btn');
    if (menuCloseBtn) {
        menuCloseBtn.addEventListener('click', () => toggleMenu(false));
    }
    
    // Overlay для закрытия меню
    const menuOverlay = document.getElementById('menu-overlay');
    if (menuOverlay) {
        menuOverlay.addEventListener('click', () => toggleMenu(false));
    }
    
    // Кнопки навигации в главном меню
    const actionButtons = document.querySelectorAll('.action-btn');
    actionButtons.forEach(button => {
        button.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            if (section) {
                openSection(section);
            }
        });
    });
    
    // Кнопки открытия кейсов
    document.querySelectorAll('.open-case-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            const caseCard = this.closest('.case-card');
            const price = caseCard?.getAttribute('data-price');
            if (price) {
                openCase(parseInt(price));
            }
        });
    });
    
    // Клик на всей карточке кейса
    document.querySelectorAll('.case-card').forEach(card => {
        card.addEventListener('click', function(e) {
            // Если клик не на кнопке "Открыть"
            if (!e.target.closest('.open-case-btn')) {
                const price = this.getAttribute('data-price');
                if (price) {
                    openCase(parseInt(price));
                }
            }
        });
    });
    
    // Кнопка ежедневного бонуса
    const dailyBonusBtn = document.getElementById('daily-bonus-btn');
    if (dailyBonusBtn) {
        dailyBonusBtn.addEventListener('click', claimDailyBonus);
    }
    
    // Кнопки назад в секциях
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            backToMain();
        });
    });
    
    // Активация промокода
    const promoBtn = document.getElementById('activate-promo-btn');
    if (promoBtn) {
        promoBtn.addEventListener('click', activatePromoCode);
    }
    
    // Сохранение трейд ссылки
    const tradeLinkBtn = document.getElementById('save-trade-link-btn');
    if (tradeLinkBtn) {
        tradeLinkBtn.addEventListener('click', setTradeLink);
    }
    
    // Копирование реферальной ссылки
    const copyRefBtn = document.getElementById('copy-ref-link-btn');
    if (copyRefBtn) {
        copyRefBtn.addEventListener('click', copyReferralLink);
    }
    
    // Кнопка в меню для копирования реферальной ссылки
    const copyReferralBtn = document.getElementById('copy-referral-btn');
    if (copyReferralBtn) {
        copyReferralBtn.addEventListener('click', copyReferralLink);
    }
    
    // Навигация через меню
    document.querySelectorAll('.menu-item[data-section]').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            if (section) {
                openSection(section);
                toggleMenu(false);
            }
        });
    });
    
    // Кнопка закрытия анимации открытия кейса
    const closeOpeningBtn = document.getElementById('close-opening-btn');
    if (closeOpeningBtn) {
        closeOpeningBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            closeCaseOpening();
        });
    }
    
    // Также закрытие по клику на overlay (фон)
    const caseOpening = document.getElementById('case-opening');
    if (caseOpening) {
        caseOpening.addEventListener('click', function(e) {
            if (e.target === this) { // Клик на самом overlay, а не на содержимом
                closeCaseOpening();
            }
        });
    }
    
    // Кнопка выхода
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', closeApp);
    }
    
    // Промокод по Enter
    const promoInput = document.getElementById('promo-code-input');
    if (promoInput) {
        promoInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') activatePromoCode();
        });
    }
    
    // Трейд ссылка по Enter
    const tradeInput = document.getElementById('trade-link-input');
    if (tradeInput) {
        tradeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') setTradeLink();
        });
    }
    
    // Фильтры инвентаря
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const filter = this.getAttribute('data-filter');
            if (filter) {
                // Убираем активный класс со всех кнопок
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('active');
                });
                // Добавляем активный класс на текущую кнопку
                this.classList.add('active');
                // Применяем фильтр
                filterInventory(filter);
            }
        });
    });
    
    // Дополнительные кнопки в разделе "Заработать"
    document.getElementById('telegram-collab-btn')?.addEventListener('click', () => {
        showToast('Скоро!', 'Функция в разработке', 'info');
    });
    
    document.getElementById('steam-collab-btn')?.addEventListener('click', () => {
        showToast('Скоро!', 'Функция в разработке', 'info');
    });
    
    document.getElementById('daily-tasks-btn')?.addEventListener('click', () => {
        showToast('Скоро!', 'Функция в разработке', 'info');
    });
    
    // Кнопка вывода всех предметов
    document.getElementById('withdraw-all-btn')?.addEventListener('click', () => {
        showToast('Скоро!', 'Функция в разработке', 'info');
    });
    
    console.log("✅ Обработчики событий установлены");
}

// ===== НАВИГАЦИЯ =====
function openSection(sectionName) {
    console.log(`📱 Открываем раздел: ${sectionName}`);
    
    // Скрываем основной контент (бонус, быстрые действия)
    const mainElements = document.querySelectorAll('.main-content > *:not(.page-section)');
    mainElements.forEach(element => {
        element.style.display = 'none';
    });
    
    // Скрываем все секции
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.add('hidden');
        section.style.display = 'none';
    });
    
    // Показываем выбранную секцию
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) {
        targetSection.classList.remove('hidden');
        targetSection.style.display = 'block';
        
        // Прокручиваем вверх
        window.scrollTo(0, 0);
        targetSection.scrollTop = 0;
        
        // Загружаем данные если нужно
        if (sectionName === 'inventory') {
            updateInventoryUI();
        } else if (sectionName === 'promo') {
            loadAvailablePromos();
        }
    }
    
    // Закрываем меню если открыто
    toggleMenu(false);
}

function backToMain() {
    console.log("🔙 Возврат на главную");
    
    // Показываем основной контент
    const mainElements = document.querySelectorAll('.main-content > *:not(.page-section)');
    mainElements.forEach(element => {
        element.style.display = 'block';
    });
    
    // Скрываем все секции
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.add('hidden');
        section.style.display = 'none';
    });
    
    // Прокручиваем вверх
    window.scrollTo(0, 0);
}

function toggleMenu(show) {
    const menu = document.getElementById('side-menu');
    if (menu) {
        if (typeof show === 'boolean') {
            if (show) {
                menu.classList.add('active');
                document.body.style.overflow = 'hidden';
            } else {
                menu.classList.remove('active');
                document.body.style.overflow = '';
            }
        } else {
            menu.classList.toggle('active');
            document.body.style.overflow = menu.classList.contains('active') ? 'hidden' : '';
        }
    }
}

// ===== API ФУНКЦИИ =====
async function apiRequest(endpoint, method = 'GET', data = null) {
    try {
        const headers = {
            'Content-Type': 'application/json',
        };
        
        // Добавляем авторизацию из Telegram если есть
        if (tg && tg.initData) {
            headers['Authorization'] = `tma ${tg.initData}`;
            console.log('🔐 Добавляем Telegram авторизацию');
        } else if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
            // Если нет initData, но есть данные пользователя, используем их для демо
            console.log('⚠️ Нет initData, используем демо-режим для API');
            return simulateAPIResponse(endpoint, method, data);
        } else {
            // Если нет данных Telegram, используем демо-режим
            console.log('⚠️ Нет данных Telegram, используем демо-режим');
            return simulateAPIResponse(endpoint, method, data);
        }
        
        const config = {
            method: method,
            headers: headers,
            mode: 'cors',
            credentials: 'omit'
        };
        
        if (data && (method === 'POST' || method === 'PUT')) {
            config.body = JSON.stringify(data);
        }
        
        console.log(`🌐 API Request: ${method} ${API_BASE_URL}${endpoint}`);
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        console.log(`📨 API Response: ${response.status} ${endpoint}`);
        
        if (!response.ok) {
            if (response.status === 401) {
                console.warn('🔐 Ошибка авторизации 401, переходим в демо-режим');
                return simulateAPIResponse(endpoint, method, data);
            }
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
        
    } catch (error) {
        console.error(`❌ API Error (${endpoint}):`, error);
        // В случае ошибки используем демо-режим
        return simulateAPIResponse(endpoint, method, data);
    }
}

// Симуляция API ответов для демо-режима
function simulateAPIResponse(endpoint, method, data) {
    console.log(`🎭 Симуляция API ответа для: ${endpoint}`);
    
    switch(endpoint) {
        case '/api/user':
            return Promise.resolve({
                success: true,
                user: {
                    id: appState.user?.id || 1003215844,
                    first_name: appState.user?.firstName || 'Демо',
                    last_name: appState.user?.lastName || 'Пользователь',
                    username: appState.user?.username || 'demo_user',
                    balance: appState.balance,
                    inventory: appState.inventory,
                    referral_code: appState.referralCode,
                    trade_link: appState.tradeLink,
                    referrals_count: appState.referralsCount
                },
                daily_bonus_available: appState.dailyBonusAvailable
            });
            
        case '/api/daily-bonus':
            if (method === 'POST') {
                const bonusAmount = Math.floor(Math.random() * 100) + 50; // 50-150
                appState.balance += bonusAmount;
                appState.dailyBonusAvailable = false;
                return Promise.resolve({
                    success: true,
                    bonus: bonusAmount,
                    new_balance: appState.balance,
                    next_available: Date.now() + 86400000,
                    message: `Ежедневный бонус: +${bonusAmount} баллов!`
                });
            }
            break;
            
        case '/api/open-case':
            if (method === 'POST' && data && data.price) {
                const price = data.price;
                if (appState.balance >= price) {
                    appState.balance -= price;
                    
                    // Генерируем случайный предмет
                    const items = [
                        { name: 'Наклейка | ENCE |', price: Math.floor(price * 0.8), type: 'sticker', rarity: 'common' },
                        { name: 'FAMAS | Колония', price: Math.floor(price * 1.2), type: 'weapon', rarity: 'uncommon' },
                        { name: 'Five-SeveN | Хладагент', price: Math.floor(price * 1.5), type: 'weapon', rarity: 'rare' },
                        { name: 'Наклейка | Клоунский парик', price: Math.floor(price * 2), type: 'sticker', rarity: 'epic' },
                        { name: 'Брелок | Щепотка соли', price: Math.floor(price * 3), type: 'collectible', rarity: 'legendary' }
                    ];
                    
                    const wonItem = items[Math.floor(Math.random() * items.length)];
                    const newItem = {
                        id: `item_${Date.now()}`,
                        name: wonItem.name,
                        price: wonItem.price,
                        type: wonItem.type,
                        rarity: wonItem.rarity,
                        received_at: Date.now() / 1000,
                        case_price: price
                    };
                    
                    appState.inventory.push(newItem);
                    
                    return Promise.resolve({
                        success: true,
                        item: newItem.name,
                        item_price: newItem.price,
                        item_type: newItem.type,
                        item_rarity: newItem.rarity,
                        new_balance: appState.balance,
                        inventory: appState.inventory,
                        message: `Вы получили: ${newItem.name}`
                    });
                } else {
                    return Promise.resolve({
                        success: false,
                        error: "Недостаточно баллов",
                        required: price,
                        current: appState.balance,
                        message: "Пополните баланс или выполните задания"
                    });
                }
            }
            break;
            
        case '/api/activate-promo':
            if (method === 'POST' && data && data.promo_code) {
                const promoCode = data.promo_code.toUpperCase();
                const promoPoints = {
                    'WELCOME1': 100,
                    'CS2FUN': 250,
                    'RANWORK': 500,
                    'START100': 100,
                    'MINIAPP': 200
                };
                
                if (promoPoints[promoCode]) {
                    appState.balance += promoPoints[promoCode];
                    return Promise.resolve({
                        success: true,
                        points: promoPoints[promoCode],
                        new_balance: appState.balance,
                        promo_code: promoCode,
                        description: "Демо промокод",
                        message: `Промокод активирован! +${promoPoints[promoCode]} баллов`
                    });
                } else {
                    return Promise.resolve({
                        success: false,
                        error: "Неверный промокод",
                        message: "Такого промокода не существует"
                    });
                }
            }
            break;
            
        case '/api/set-trade-link':
            if (method === 'POST' && data && data.trade_link) {
                appState.tradeLink = data.trade_link;
                return Promise.resolve({
                    success: true,
                    message: "Трейд ссылка сохранена",
                    trade_link: data.trade_link,
                    validated: true
                });
            }
            break;
            
        case '/api/available-promos':
            return Promise.resolve({
                success: true,
                promos: [
                    { code: 'WELCOME1', points: 100, description: 'Добро пожаловать!', remaining_uses: "∞", max_uses: -1, used: 0 },
                    { code: 'CS2FUN', points: 250, description: 'Для настоящих фанатов CS2', remaining_uses: 95, max_uses: 100, used: 5 },
                    { code: 'RANWORK', points: 500, description: 'От создателей бота', remaining_uses: 45, max_uses: 50, used: 5 },
                    { code: 'START100', points: 100, description: 'Стартовый бонус', remaining_uses: "∞", max_uses: -1, used: 0 },
                    { code: 'MINIAPP', points: 200, description: 'За запуск Mini App', remaining_uses: 180, max_uses: 200, used: 20 }
                ],
                total: 5,
                server_time: Date.now() / 1000
            });
    }
    
    // По умолчанию возвращаем успех
    return Promise.resolve({
        success: true,
        message: "Демо-режим: операция выполнена",
        demo_mode: true
    });
}

async function loadUserData() {
    try {
        console.log("🔄 Загрузка данных пользователя...");
        
        const response = await apiRequest('/api/user');
        
        if (response.success && !response.demo_mode) {
            // Обновляем только если не демо-режим
            appState.balance = response.user.balance;
            appState.inventory = response.user.inventory || [];
            appState.dailyBonusAvailable = response.daily_bonus_available;
            appState.referralCode = response.user.referral_code;
            appState.tradeLink = response.user.trade_link;
            appState.referralsCount = response.user.referrals_count;
            
            updateUserInfo();
            updateInventoryUI();
            updateProfileInfo();
            
            showToast('Добро пожаловать!', `Баланс: ${appState.balance} баллов`, 'success');
        } else if (response.demo_mode) {
            // Уже используем демо данные
            console.log('🎭 Используем демо-данные');
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error);
        // Уже используем тестовые данные
    }
}

async function testAPIConnection() {
    try {
        console.log("🔍 Проверка подключения к API...");
        const response = await fetch(`${API_BASE_URL}/api/health`);
        if (response.ok) {
            const data = await response.json();
            console.log("✅ API доступен:", data);
            return true;
        } else {
            console.warn("⚠️ API недоступен, статус:", response.status);
            return false;
        }
    } catch (error) {
        console.error("❌ Ошибка подключения к API:", error);
        return false;
    }
}

async function openCase(price) {
    try {
        showCaseOpening();
        
        const response = await apiRequest('/api/open-case', 'POST', { price: price });
        
        if (response.success) {
            appState.balance = response.new_balance;
            appState.inventory = response.inventory;
            
            updateUserInfo();
            updateInventoryUI();
            
            setTimeout(() => {
                showWonItem(response.item, response.item_price);
            }, 2000);
        } else {
            closeCaseOpening();
            showToast('Ошибка', response.error || 'Недостаточно баллов', 'error');
        }
        
    } catch (error) {
        console.error('❌ Ошибка открытия кейса:', error);
        closeCaseOpening();
        showToast('Ошибка', 'Не удалось открыть кейс', 'error');
    }
}

async function claimDailyBonus() {
    try {
        const response = await apiRequest('/api/daily-bonus', 'POST');
        
        if (response.success) {
            appState.balance = response.new_balance;
            appState.dailyBonusAvailable = false;
            
            updateUserInfo();
            updateBonusTimer();
            
            showToast('Успех!', `Получено ${response.bonus} баллов`, 'success');
        } else {
            showToast('Ошибка', response.error || 'Бонус уже получен', 'warning');
        }
        
    } catch (error) {
        console.error('❌ Ошибка получения бонуса:', error);
        showToast('Ошибка', 'Не удалось получить бонус', 'error');
    }
}

async function activatePromoCode() {
    const input = document.getElementById('promo-code-input');
    const promoCode = input?.value.trim().toUpperCase();
    
    if (!promoCode) {
        showToast('Ошибка', 'Введите промокод', 'warning');
        return;
    }
    
    try {
        const response = await apiRequest('/api/activate-promo', 'POST', { 
            promo_code: promoCode 
        });
        
        if (response.success) {
            appState.balance = response.new_balance;
            updateUserInfo();
            
            input.value = '';
            showToast('Успех!', `Активирован промокод на ${response.points} баллов`, 'success');
        } else {
            showToast('Ошибка', response.error || 'Промокод не действителен', 'error');
        }
        
    } catch (error) {
        console.error('❌ Ошибка активации промокода:', error);
        showToast('Ошибка', 'Не удалось активировать промокод', 'error');
    }
}

async function setTradeLink() {
    const input = document.getElementById('trade-link-input');
    const tradeLink = input?.value.trim();
    
    if (!tradeLink) {
        showToast('Ошибка', 'Введите трейд ссылку', 'warning');
        return;
    }
    
    try {
        const response = await apiRequest('/api/set-trade-link', 'POST', { 
            trade_link: tradeLink 
        });
        
        if (response.success) {
            appState.tradeLink = tradeLink;
            showToast('Успех!', 'Трейд ссылка сохранена', 'success');
        } else {
            showToast('Ошибка', response.error || 'Неверная ссылка', 'error');
        }
        
    } catch (error) {
        console.error('❌ Ошибка сохранения ссылки:', error);
        showToast('Ошибка', 'Не удалось сохранить ссылку', 'error');
    }
}

async function withdrawItem(itemId) {
    try {
        // Сначала проверяем трейд ссылку
        if (!appState.tradeLink) {
            openSection('profile');
            showToast('Требуется ссылка', 'Укажите трейд ссылку в профиле', 'warning');
            return;
        }
        
        const response = await apiRequest('/api/withdraw-item', 'POST', { 
            item_id: itemId 
        });
        
        if (response.success) {
            // Обновляем инвентарь
            appState.inventory = appState.inventory.filter(item => item.id !== itemId);
            updateInventoryUI();
            
            showToast('Успех!', 'Запрос на вывод отправлен', 'success');
        } else {
            showToast('Ошибка', response.error || 'Не удалось вывести предмет', 'error');
        }
        
    } catch (error) {
        console.error('❌ Ошибка вывода предмета:', error);
        showToast('Ошибка', 'Не удалось вывести предмет', 'error');
    }
}

async function loadAvailablePromos() {
    try {
        const response = await apiRequest('/api/available-promos');
        
        if (response.success) {
            updatePromoList(response.promos);
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки промокодов:', error);
    }
}

// ===== UI ФУНКЦИИ =====
function updateUserInfo() {
    if (appState.user) {
        // Обновляем имя в заголовке
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = appState.user.firstName;
        }
        
        // Обновляем баланс
        const balanceElement = document.getElementById('balance');
        if (balanceElement) {
            balanceElement.textContent = appState.balance;
        }
        
        // Обновляем меню
        const menuUsername = document.getElementById('menu-username');
        const menuBalance = document.getElementById('menu-balance');
        if (menuUsername) menuUsername.textContent = appState.user.firstName;
        if (menuBalance) menuBalance.textContent = `${appState.balance} баллов`;
    }
}

function updateInventoryUI() {
    const inventoryList = document.getElementById('inventory-list');
    const totalItems = document.getElementById('total-items');
    const totalValue = document.getElementById('total-value');
    
    if (!inventoryList) return;
    
    // Очищаем список
    inventoryList.innerHTML = '';
    
    if (appState.inventory.length === 0) {
        inventoryList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-box-open"></i>
                </div>
                <h3>Инвентарь пуст</h3>
                <p>Откройте кейсы, чтобы получить предметы</p>
                <button class="btn-primary" onclick="openSection('cases')">
                    <i class="fas fa-box-open"></i> Открыть кейсы
                </button>
            </div>
        `;
        
        if (totalItems) totalItems.textContent = '0';
        if (totalValue) totalValue.textContent = '0';
        return;
    }
    
    // Считаем статистику
    let totalPrice = 0;
    
    // Добавляем предметы
    appState.inventory.forEach((item, index) => {
        totalPrice += item.price || 0;
        
        const itemElement = document.createElement('div');
        itemElement.className = 'inventory-item';
        itemElement.innerHTML = `
            <div class="item-info">
                <div class="item-name">${item.name}</div>
                <div class="item-meta">
                    <span class="item-type">${getTypeIcon(item.type)} ${item.type}</span>
                    <span class="item-rarity ${item.rarity}">${item.rarity}</span>
                </div>
                <div class="item-price">
                    <i class="fas fa-coins"></i> ${item.price || 0} баллов
                </div>
            </div>
            <button class="withdraw-btn" onclick="withdrawItem('${item.id}')">
                <i class="fas fa-download"></i> Вывести
            </button>
        `;
        
        inventoryList.appendChild(itemElement);
    });
    
    // Обновляем статистику
    if (totalItems) totalItems.textContent = appState.inventory.length;
    if (totalValue) totalValue.textContent = totalPrice;
}

function getTypeIcon(type) {
    switch(type) {
        case 'sticker': return '<i class="fas fa-sticky-note"></i>';
        case 'weapon': return '<i class="fas fa-gun"></i>';
        case 'collectible': return '<i class="fas fa-gem"></i>';
        case 'case': return '<i class="fas fa-box"></i>';
        default: return '<i class="fas fa-question"></i>';
    }
}

function filterInventory(filterType) {
    const inventoryList = document.getElementById('inventory-list');
    if (!inventoryList) return;
    
    // В реальном приложении здесь была бы фильтрация
    // Для демо просто показываем сообщение
    if (filterType !== 'all') {
        showToast('Фильтр', `Показываем предметы типа: ${filterType}`, 'info');
    }
}

function updateProfileInfo() {
    if (!appState.user) return;
    
    const profileName = document.getElementById('profile-name');
    const profileId = document.getElementById('profile-id');
    const profileRefCode = document.getElementById('profile-ref-code');
    const profileRefCount = document.getElementById('profile-ref-count');
    const tradeLinkInput = document.getElementById('trade-link-input');
    
    if (profileName) profileName.textContent = `${appState.user.firstName} ${appState.user.lastName}`;
    if (profileId) profileId.textContent = appState.user.id;
    if (profileRefCode) profileRefCode.textContent = appState.referralCode;
    if (profileRefCount) profileRefCount.textContent = appState.referralsCount;
    if (tradeLinkInput) tradeLinkInput.value = appState.tradeLink || '';
}

function updatePromoList(promos) {
    const promoList = document.getElementById('promo-list');
    if (!promoList) return;
    
    promoList.innerHTML = '';
    
    if (!promos || promos.length === 0) {
        promoList.innerHTML = '<div class="empty-promo">Нет доступных промокодов</div>';
        return;
    }
    
    promos.forEach(promo => {
        const promoElement = document.createElement('div');
        promoElement.className = 'promo-item';
        promoElement.innerHTML = `
            <div>
                <span class="promo-code">${promo.code}</span>
                <div class="promo-desc">${promo.description || ''}</div>
            </div>
            <div>
                <div class="promo-reward">+${promo.points} баллов</div>
                <div class="promo-uses">Осталось: ${promo.remaining_uses}</div>
            </div>
        `;
        promoList.appendChild(promoElement);
    });
}

function updateBonusTimer() {
    const timerElement = document.getElementById('timer');
    const bonusBtn = document.getElementById('daily-bonus-btn');
    
    if (!timerElement || !bonusBtn) return;
    
    if (appState.dailyBonusAvailable) {
        timerElement.textContent = 'Доступно сейчас!';
        bonusBtn.disabled = false;
        bonusBtn.innerHTML = '<i class="fas fa-gift"></i> Забрать';
        bonusBtn.style.opacity = '1';
    } else {
        // Таймер для следующего бонуса (через 24 часа)
        const nextBonusTime = Date.now() + 86400000; // 24 часа
        const now = Date.now();
        const diff = nextBonusTime - now;
        
        if (diff > 0) {
            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            
            timerElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            bonusBtn.disabled = true;
            bonusBtn.innerHTML = '<i class="fas fa-clock"></i> Уже получено';
            bonusBtn.style.opacity = '0.7';
        } else {
            appState.dailyBonusAvailable = true;
            timerElement.textContent = 'Доступно сейчас!';
            bonusBtn.disabled = false;
            bonusBtn.innerHTML = '<i class="fas fa-gift"></i> Забрать';
            bonusBtn.style.opacity = '1';
        }
    }
}

// ===== АНИМАЦИИ =====
function showCaseOpening() {
    const openingElement = document.getElementById('case-opening');
    const openingText = document.getElementById('opening-text');
    
    if (openingElement && openingText) {
        openingElement.classList.remove('hidden');
        openingElement.style.display = 'flex';
        openingText.textContent = 'Открываем кейс...';
        
        // Скрываем список выигранных предметов
        const wonItem = document.getElementById('won-item');
        if (wonItem) {
            wonItem.innerHTML = '';
            wonItem.style.display = 'none';
        }
    }
}

function showWonItem(itemName, itemPrice) {
    const wonItemElement = document.getElementById('won-item');
    const openingText = document.getElementById('opening-text');
    
    if (wonItemElement && openingText) {
        openingText.textContent = 'Поздравляем!';
        wonItemElement.innerHTML = `
            <div class="won-item-content">
                <i class="fas fa-gift fa-3x"></i>
                <h3>${itemName}</h3>
                <p class="item-price-won">
                    <i class="fas fa-coins"></i> ${itemPrice} баллов
                </p>
                <p class="item-message">Предмет добавлен в ваш инвентарь!</p>
            </div>
        `;
        wonItemElement.style.display = 'block';
    }
}

function closeCaseOpening() {
    console.log("❌ Закрытие анимации открытия кейса");
    const openingElement = document.getElementById('case-opening');
    if (openingElement) {
        openingElement.classList.add('hidden');
        openingElement.style.display = 'none';
    }
}

// ===== УТИЛИТЫ =====
function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas fa-${type === 'success' ? 'check-circle' : 
                              type === 'error' ? 'exclamation-circle' : 
                              type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;
    
    container.appendChild(toast);
    
    // Удаляем через 5 секунд
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 5000);
}

function copyReferralLink() {
    const link = `https://t.me/MeteoHinfoBot?start=${appState.referralCode}`;
    
    // Пытаемся использовать современный Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link)
            .then(() => showToast('Скопировано!', 'Реферальная ссылка скопирована', 'success'))
            .catch(err => {
                console.error('Ошибка копирования:', err);
                fallbackCopy(link);
            });
    } else {
        // Fallback для старых браузеров
        fallbackCopy(link);
    }
}

function fallbackCopy(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showToast('Скопировано!', 'Реферальная ссылка скопирована', 'success');
        } else {
            showToast('Ошибка', 'Не удалось скопировать ссылку', 'error');
        }
    } catch (err) {
        console.error('Ошибка fallback копирования:', err);
        showToast('Ошибка', 'Не удалось скопировать ссылку', 'error');
    }
    
    document.body.removeChild(textArea);
}

function closeApp() {
    if (tg && tg.close) {
        tg.close();
    } else {
        showToast('Внимание', 'Приложение можно закрыть через Telegram', 'info');
    }
}

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ HTML =====
// Делаем функции доступными глобально для onclick атрибутов в инвентаре
window.openSection = openSection;
window.backToMain = backToMain;
window.claimDailyBonus = claimDailyBonus;
window.openCase = openCase;
window.activatePromoCode = activatePromoCode;
window.setTradeLink = setTradeLink;
window.copyReferralLink = copyReferralLink;
window.toggleMenu = toggleMenu;
window.closeCaseOpening = closeCaseOpening;
window.withdrawItem = withdrawItem;
window.closeApp = closeApp;
window.filterInventory = filterInventory;

console.log("📦 CS2 Skin Bot скрипт загружен!");
