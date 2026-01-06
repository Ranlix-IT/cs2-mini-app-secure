// Telegram Web App SDK
let tg;
let appState = {
    user: null,
    balance: 1000,
    inventory: [],
    dailyBonusAvailable: true,
    referralCode: "",
    tradeLink: "",
    referralsCount: 0
};

const API_BASE_URL = "https://cs2-mini-app.onrender.com";
const APP_VERSION = "2.0.1";

// Улучшенная система заработка
let enhancedEarnState = {
    referralLink: "",
    nextMilestone: null,
    progressPercent: 0,
    telegramVerified: false,
    steamVerified: false,
    passiveIncomePercent: 0
};

// Таймер для реферального кода
let referralTimerInterval = null;

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 CS2 Skin Bot запускается...");
    
    // Проверка обновлений
    checkForUpdates();
    
    // Проверяем среду запуска
    checkEnvironment();
    
    setupEventListeners();
    updateBonusTimer();
    setInterval(updateBonusTimer, 1000);
    
    // Инициализируем улучшенный заработок
    setTimeout(() => {
        initEnhancedEarning();
        loadEarnData();
    }, 500);
    
    // Тестируем API соединение
    setTimeout(testAPIConnection, 1000);
    
    // Регистрация Service Worker для PWA
    registerServiceWorker();
    
    // Запуск периодической проверки обновлений
    startUpdateChecker();
});

// ===== АВТОРИЗАЦИЯ =====
function checkWebAuth() {
    const cookies = document.cookie.split(';');
    let userData = null;
    
    for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.startsWith('user_data=')) {
            try {
                const jsonStr = decodeURIComponent(cookie.substring('user_data='.length));
                userData = JSON.parse(jsonStr);
                break;
            } catch (e) {
                console.error('Error parsing user_data cookie:', e);
            }
        }
    }
    
    return userData;
}

function checkEnvironment() {
    const overlay = document.getElementById('web-auth-overlay');
    
    // 1. Проверяем, находимся ли мы в Telegram Mini App
    try {
        if (typeof window.Telegram !== 'undefined' && window.Telegram.WebApp) {
            tg = window.Telegram.WebApp;
            console.log('📱 Telegram Mini App detected');
            
            // В Telegram Mini App НЕ показываем оверлей авторизации
            if (overlay) overlay.style.display = 'none';
            
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
                return;
            } else {
                console.warn("⚠️ Данные пользователя Telegram не получены");
                // В Mini App все равно не показываем оверлей, используем демо
                useTestData();
                return;
            }
        }
    } catch (error) {
        console.error('❌ Ошибка проверки Telegram:', error);
    }
    
    // 2. Если НЕ в Telegram Mini App, проверяем веб-авторизацию
    const userData = checkWebAuth();
    if (userData) {
        console.log("✅ Веб-авторизация через cookie:", userData);
        if (overlay) overlay.style.display = 'none';
        
        appState.user = {
            id: userData.id,
            firstName: userData.first_name,
            lastName: userData.last_name || '',
            username: userData.username || `user_${userData.id}`
        };
        
        loadUserData();
        return;
    }
    
    // 3. Если не авторизован ни через Mini App, ни через cookies
    console.log("🌐 Неавторизованный доступ через браузер");
    if (overlay) overlay.style.display = 'flex';
    
    // Не используем тестовые данные - показываем только оверлей
    // useTestData(); // ЗАКОММЕНТИРОВАТЬ!
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
    appState.referralCode = `ref_${appState.user.id}_demo`;
    appState.referralsCount = 3;
    appState.tradeLink = "https://steamcommunity.com/tradeoffer/new/partner=123456789";
    
    updateUserInfo();
    updateInventoryUI();
    updateProfileInfo();
    
    showToast('Демо-режим', 'Используются тестовые данные', 'info');
}

// ===== УТИЛИТЫ ДЛЯ ПРЕДОТВРАЩЕНИЯ ДВОЙНЫХ КЛИКОВ =====
let isProcessing = false;

function debounce(func, delay = 300) {
    if (isProcessing) return;
    
    isProcessing = true;
    func();
    
    setTimeout(() => {
        isProcessing = false;
    }, delay);
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
        menuCloseBtn.addEventListener('click', function() { 
            toggleMenu(false); 
        });
    }
    
    // Overlay для закрытия меню
    const menuOverlay = document.getElementById('menu-overlay');
    if (menuOverlay) {
        menuOverlay.addEventListener('click', function() { 
            toggleMenu(false); 
        });
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
            const price = caseCard ? caseCard.getAttribute('data-price') : null;
            if (price) {
                openCase(parseInt(price));
            }
        });
    });
    
    // Клик на всей карточке кейса
    document.querySelectorAll('.case-card').forEach(card => {
        card.addEventListener('click', function(e) {
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
        dailyBonusBtn.addEventListener('click', function() { 
            debounce(claimDailyBonus); 
        });
    }
    
    // Кнопки назад в секциях
    document.querySelectorAll('.page-section .back-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            debounce(backToMain);
        });
    });
    
    // Кнопка закрытия анимации открытия кейса
    const closeCaseBtn = document.getElementById('close-case-btn');
    if (closeCaseBtn) {
        closeCaseBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            debounce(closeCaseOpening);
        });
    }
    
    // Активация промокода
    const promoBtn = document.getElementById('activate-promo-btn');
    if (promoBtn) {
        promoBtn.addEventListener('click', function() { 
            debounce(activatePromoCode); 
        });
    }
    
    // Сохранение трейд ссылки
    const tradeLinkBtn = document.getElementById('save-trade-link-btn');
    if (tradeLinkBtn) {
        tradeLinkBtn.addEventListener('click', function() { 
            debounce(setTradeLink); 
        });
    }
    
    // Копирование реферальной ссылки
    const copyRefBtn = document.getElementById('copy-ref-link-btn');
    if (copyRefBtn) {
        copyRefBtn.addEventListener('click', function() { 
            debounce(copyReferralLink); 
        });
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
    
    // Кнопка выхода
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', closeApp);
    }
    
    // Промокод по Enter
    const promoInput = document.getElementById('promo-code-input');
    if (promoInput) {
        promoInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') debounce(activatePromoCode);
        });
    }
    
    // Трейд ссылка по Enter
    const tradeInput = document.getElementById('trade-link-input');
    if (tradeInput) {
        tradeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') debounce(setTradeLink);
        });
    }
    
    // Фильтры инвентаря
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const filter = this.getAttribute('data-filter');
            if (filter) {
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('active');
                });
                this.classList.add('active');
                filterInventory(filter);
            }
        });
    });
    
    // Кнопка для открытия в Telegram (в оверлее)
    const openBotBtn = document.querySelector('.open-bot-btn');
    if (openBotBtn) {
        openBotBtn.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Если в Telegram Mini App, просто закрываем оверлей
            if (tg && tg.close) {
                tg.close();
            } else {
                // В браузере открываем бота в новом окне
                window.open('https://t.me/rancasebot', '_blank');
            }
        });
    }
    
    console.log("✅ Обработчики событий установлены");
}

// ===== НАВИГАЦИЯ =====
function openSection(sectionName) {
    console.log(`📱 Открываем раздел: ${sectionName}`);
    
    const mainElements = document.querySelectorAll('.main-content > *:not(.page-section)');
    mainElements.forEach(element => {
        element.style.display = 'none';
    });
    
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.add('hidden');
        section.style.display = 'none';
    });
    
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) {
        targetSection.classList.remove('hidden');
        targetSection.style.display = 'block';
        
        window.scrollTo(0, 0);
        targetSection.scrollTop = 0;
        
        if (sectionName === 'inventory') {
            updateInventoryUI();
        } else if (sectionName === 'promo') {
            loadAvailablePromos();
        } else if (sectionName === 'earn') {
            loadEarnData();
        }
    }
    
    toggleMenu(false);
}

function backToMain() {
    console.log("🔙 Возврат на главную");
    
    const mainElements = document.querySelectorAll('.main-content > *:not(.page-section)');
    mainElements.forEach(element => {
        element.style.display = 'block';
    });
    
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.add('hidden');
        section.style.display = 'none';
    });
    
    const caseOpening = document.getElementById('case-opening');
    if (caseOpening) {
        caseOpening.classList.add('hidden');
        caseOpening.style.display = 'none';
    }
    
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
            'Cache-Control': 'no-cache'
        };
        
        // Проверяем, авторизованы ли мы через Mini App
        if (tg && tg.initData) {
            headers['Authorization'] = `tma ${tg.initData}`;
            console.log('🔐 Добавляем Telegram авторизацию Mini App');
        } 
        // Проверяем, авторизованы ли мы через Web Cookie
        else if (checkWebAuth()) {
            const userData = checkWebAuth();
            headers['X-Telegram-User'] = JSON.stringify({
                id: userData.id,
                first_name: userData.first_name,
                last_name: userData.last_name,
                username: userData.username
            });
            console.log('🌐 Добавляем Telegram авторизацию через Cookie');
        }
        // Демо-режим для тестирования
        else {
            console.log('⚠️ Нет данных аутентификации, используем демо-режим для API');
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
                    id: appState.user ? appState.user.id : 1003215844,
                    first_name: appState.user ? appState.user.firstName : 'Демо',
                    last_name: appState.user ? appState.user.lastName : 'Пользователь',
                    username: appState.user ? appState.user.username : 'demo_user',
                    balance: appState.balance,
                    inventory: appState.inventory,
                    referral_code: appState.referralCode,
                    trade_link: appState.tradeLink,
                    referrals_count: appState.referralsCount
                },
                daily_bonus_available: appState.dailyBonusAvailable,
                telegram_profile_status: {
                    verified: enhancedEarnState.telegramVerified,
                    total_earned: enhancedEarnState.telegramVerified ? 500 : 0
                },
                steam_profile_status: {
                    verified: enhancedEarnState.steamVerified,
                    level: 10,
                    total_earned: enhancedEarnState.steamVerified ? 1000 : 0
                },
                stats: {
                    total_earned: appState.balance - 100,
                    from_referrals: 500,
                    from_telegram: enhancedEarnState.telegramVerified ? 500 : 0,
                    from_steam: enhancedEarnState.steamVerified ? 1000 : 0,
                    total_invites: 3,
                    active_invites: 3
                }
            });
            
        case '/api/daily-bonus':
            if (method === 'POST') {
                const bonusAmount = Math.floor(Math.random() * 100) + 50;
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
            
        case '/api/can-use-referral':
            return Promise.resolve({
                success: true,
                can_use: true,
                time_left: 180,
                minutes_left: 3,
                message: "Вы можете ввести реферальный код",
                demo_mode: true
            });
            
        case '/api/earn/stats':
            return Promise.resolve({
                success: true,
                stats: {
                    total_earned: 1500,
                    from_referrals: 500,
                    from_telegram: enhancedEarnState.telegramVerified ? 500 : 0,
                    from_steam: enhancedEarnState.steamVerified ? 1000 : 0,
                    total_invites: 3,
                    active_invites: 3,
                    referral_tier: 0,
                    daily_estimate: (enhancedEarnState.telegramVerified ? 71 : 0) + (enhancedEarnState.steamVerified ? 107 : 0),
                    weekly_estimate: (enhancedEarnState.telegramVerified ? 500 : 0) + (enhancedEarnState.steamVerified ? 750 : 0),
                    monthly_estimate: (enhancedEarnState.telegramVerified ? 2143 : 0) + (enhancedEarnState.steamVerified ? 3214 : 0)
                },
                next_milestone: { invites: 5, bonus: 1000, badge: "🎖️ Начинающий" },
                progress_percent: 60,
                telegram_status: { verified: enhancedEarnState.telegramVerified },
                steam_status: { verified: enhancedEarnState.steamVerified, level: 10 }
            });
            
        case '/api/earn/check-telegram':
            if (method === 'POST') {
                if (!enhancedEarnState.telegramVerified) {
                    enhancedEarnState.telegramVerified = true;
                    appState.balance += 500;
                    updateUserInfo();
                    return Promise.resolve({
                        success: true,
                        verified: true,
                        last_name_ok: true,
                        bio_ok: true,
                        profile_photo_ok: true,
                        rewards_available: 500,
                        reward_received: true,
                        penalty_applied: false,
                        next_check: Date.now() + 604800000,
                        message: "Telegram профиль проверен"
                    });
                }
                return Promise.resolve({
                    success: true,
                    verified: true,
                    last_name_ok: true,
                    bio_ok: true,
                    profile_photo_ok: true,
                    rewards_available: 0,
                    reward_received: false,
                    penalty_applied: false,
                    next_check: Date.now() + 604800000,
                    message: "Telegram профиль уже проверен"
                });
            }
            break;
            
        case '/api/earn/check-steam':
            if (method === 'POST') {
                if (!enhancedEarnState.steamVerified) {
                    enhancedEarnState.steamVerified = true;
                    appState.balance += 1000;
                    updateUserInfo();
                    return Promise.resolve({
                        success: true,
                        verified: true,
                        level: 10,
                        has_link: true,
                        is_public: true,
                        game_count: 42,
                        badges_count: 7,
                        profile_age_days: 365,
                        rewards_available: 1000,
                        reward_received: true,
                        next_reward_date: Date.now() + 604800000,
                        message: "Steam профиль проверен"
                    });
                }
                return Promise.resolve({
                    success: true,
                    verified: true,
                    level: 10,
                    has_link: true,
                    is_public: true,
                    game_count: 42,
                    badges_count: 7,
                    profile_age_days: 365,
                    rewards_available: 0,
                    reward_received: false,
                    next_reward_date: Date.now() + 604800000,
                    message: "Steam профиль уже проверен"
                });
            }
            break;
            
        case '/api/earn/invite-friend':
            if (method === 'POST') {
                appState.balance += 500;
                appState.referralsCount += 1;
                updateUserInfo();
                
                const totalInvites = appState.referralsCount;
                let milestoneBonus = 0;
                let newTier = 0;
                
                if (totalInvites === 5) {
                    milestoneBonus = 1000;
                    newTier = 1;
                    appState.balance += milestoneBonus;
                }
                
                return Promise.resolve({
                    success: true,
                    base_reward: 500,
                    milestone_bonus: milestoneBonus,
                    new_balance: appState.balance,
                    total_invites: totalInvites,
                    referral_tier: newTier,
                    milestone_reached: milestoneBonus > 0,
                    passive_income_activated: totalInvites >= 10,
                    passive_income_percent: totalInvites >= 50 ? 15 : totalInvites >= 25 ? 10 : totalInvites >= 10 ? 5 : 0,
                    message: `Друг приглашен! +500 баллов` + (milestoneBonus > 0 ? ` + бонус ${milestoneBonus} баллов за достижение!` : "")
                });
            }
            break;
            
        case '/api/earn/referral-info':
            const totalInvites = appState.referralsCount;
            return Promise.resolve({
                success: true,
                referral_code: appState.referralCode,
                referral_link: `https://t.me/rancasebot?start=${appState.referralCode}`,
                total_invites: totalInvites,
                referral_tier: 0,
                current_milestone: null,
                next_milestone: { invites: 5, bonus: 1000, badge: "🎖️ Начинающий" },
                progress_percent: (totalInvites / 5) * 100,
                invites_needed: 5 - totalInvites,
                base_reward: 500,
                passive_income: {
                    enabled: totalInvites >= 10,
                    percent: totalInvites >= 50 ? 15 : totalInvites >= 25 ? 10 : totalInvites >= 10 ? 5 : 0
                },
                all_milestones: [
                    { invites: 5, bonus: 1000, badge: "🎖️ Начинающий" },
                    { invites: 10, bonus: 2500, badge: "🥉 Бронзовый агент" },
                    { invites: 25, bonus: 7500, badge: "🥈 Серебряный агент" },
                    { invites: 50, bonus: 20000, badge: "🥇 Золотой агент" },
                    { invites: 100, bonus: 50000, badge: "👑 Король рефералов" }
                ]
            });
    }
    
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
            appState.balance = response.user.balance;
            appState.inventory = response.user.inventory || [];
            appState.dailyBonusAvailable = response.daily_bonus_available;
            appState.referralCode = response.user.referral_code;
            appState.tradeLink = response.user.trade_link;
            appState.referralsCount = response.user.referrals_count;
            
            if (response.telegram_profile_status) {
                enhancedEarnState.telegramVerified = response.telegram_profile_status.verified;
            }
            if (response.steam_profile_status) {
                enhancedEarnState.steamVerified = response.steam_profile_status.verified;
            }
            
            updateUserInfo();
            updateInventoryUI();
            updateProfileInfo();
            
            showToast('Добро пожаловать!', `Баланс: ${appState.balance} баллов`, 'success');
        } else if (response.demo_mode) {
            console.log('🎭 Используем демо-данные');
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error);
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

// ===== АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ =====
function checkForUpdates() {
    const lastVersion = localStorage.getItem('app_version');
    const lastUpdate = localStorage.getItem('last_update');
    const now = Date.now();
    
    // Если прошло больше 24 часов с последнего обновления
    if (!lastUpdate || (now - parseInt(lastUpdate)) > 24 * 60 * 60 * 1000) {
        console.log('🔄 Проверка обновлений...');
        
        // Очистка устаревшего кеша
        clearOldCache();
        
        // Обновляем версию
        localStorage.setItem('app_version', APP_VERSION);
        localStorage.setItem('last_update', now.toString());
        
        // Уведомляем о новом запуске
        console.log(`✅ Приложение v${APP_VERSION} запущено`);
    }
}

function clearOldCache() {
    // Очищаем старые данные localStorage (кроме важных)
    const keepKeys = ['user_preferences', 'app_version', 'last_update', 'telegram_auth_data', 'web_auth_hash'];
    Object.keys(localStorage).forEach(key => {
        if (!keepKeys.includes(key) && !key.startsWith('telegram_')) {
            localStorage.removeItem(key);
        }
    });
    
    // Очищаем sessionStorage
    sessionStorage.clear();
    
    // Запрашиваем обновление Service Worker
    updateServiceWorker();
}

function updateServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(registration => {
                registration.update();
            });
        });
    }
}

function startUpdateChecker() {
    // Проверяем обновления каждые 30 минут
    setInterval(() => {
        checkServerForUpdates();
    }, 30 * 60 * 1000);
    
    // Проверяем при возвращении на вкладку
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            quickUpdateCheck();
        }
    });
}

async function checkServerForUpdates() {
    try {
        const response = await fetch('/api/health', {
            headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Сервер доступен, версия:', data.version);
            
            // Проверяем версию API
            if (data.version && data.version !== "2.0.1") {
                showUpdateNotification('Доступно обновление API', 'Перезагрузите приложение для получения новых функций');
            }
        }
    } catch (error) {
        console.log('Проверка обновлений:', error);
    }
}

function quickUpdateCheck() {
    // Быстрая проверка - просто перезагружаем данные
    if (appState.user) {
        loadUserData();
        loadEarnData();
    }
}

function showUpdateNotification(title, message) {
    // Показываем только если нет других уведомлений
    if (!document.querySelector('.update-notification')) {
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.innerHTML = `
            <div class="update-content">
                <i class="fas fa-sync-alt"></i>
                <div class="update-text">
                    <h4>${title}</h4>
                    <p>${message}</p>
                </div>
                <button class="update-btn" onclick="this.closest('.update-notification').remove();">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Автоудаление через 10 секунд
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 10000);
    }
}

// Регистрация Service Worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('/service-worker.js?v=' + APP_VERSION).then(
                function(registration) {
                    console.log('✅ ServiceWorker зарегистрирован: ', registration.scope);
                    
                    // Слушаем сообщения от Service Worker
                    navigator.serviceWorker.addEventListener('message', event => {
                        if (event.data.type === 'NEW_VERSION') {
                            console.log('🔄 Новая версия Service Worker:', event.data.version);
                            showUpdateNotification('Обновление загружено', 'Приложение будет перезагружено');
                            setTimeout(() => window.location.reload(), 3000);
                        }
                    });
                    
                    // Проверяем обновления
                    registration.update();
                },
                function(err) {
                    console.log('❌ Ошибка регистрации ServiceWorker: ', err);
                }
            );
        });
    }
}

// ===== ОСНОВНЫЕ ФУНКЦИИ =====
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
    const promoCode = input ? input.value.trim().toUpperCase() : '';
    
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
    const tradeLink = input ? input.value.trim() : '';
    
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
        if (!appState.tradeLink) {
            openSection('profile');
            showToast('Требуется ссылка', 'Укажите трейд ссылку в профиле', 'warning');
            return;
        }
        
        const response = await apiRequest('/api/withdraw-item', 'POST', { 
            item_id: itemId 
        });
        
        if (response.success) {
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

// ===== УЛУЧШЕННАЯ СИСТЕМА ЗАРАБОТКА =====
async function loadEarnData() {
    try {
        const response = await apiRequest('/api/earn/stats');
        
        if (response.success) {
            const stats = response.stats;
            
            const totalEarned = document.getElementById('total-earned');
            const totalInvites = document.getElementById('total-invites');
            const telegramEarned = document.getElementById('telegram-earned');
            const steamEarned = document.getElementById('steam-earned');
            
            if (totalEarned) totalEarned.textContent = stats.total_earned;
            if (totalInvites) totalInvites.textContent = stats.total_invites;
            if (telegramEarned) telegramEarned.textContent = stats.from_telegram;
            if (steamEarned) steamEarned.textContent = stats.from_steam;
            
            if (response.progress_percent !== undefined) {
                const progressBar = document.getElementById('referral-progress-bar');
                const currentInvites = document.getElementById('current-invites');
                const nextMilestone = document.getElementById('next-milestone');
                const nextMilestoneText = document.getElementById('next-milestone-text');
                const nextMilestoneReward = document.getElementById('next-milestone-reward');
                
                if (progressBar) progressBar.style.width = `${response.progress_percent}%`;
                if (currentInvites) currentInvites.textContent = stats.total_invites;
                
                if (response.next_milestone) {
                    if (nextMilestone) nextMilestone.textContent = ` / ${response.next_milestone.invites}`;
                    if (nextMilestoneText) nextMilestoneText.textContent = `Пригласить ${response.next_milestone.invites} друзей`;
                    if (nextMilestoneReward) nextMilestoneReward.textContent = `+${response.next_milestone.bonus} баллов`;
                }
            }
            
            if (response.next_milestone) {
                const currentTier = document.getElementById('current-tier');
                if (currentTier) currentTier.textContent = response.next_milestone.badge || 'Новичок';
            }
            
            enhancedEarnState.nextMilestone = response.next_milestone;
            enhancedEarnState.progressPercent = response.progress_percent;
            enhancedEarnState.telegramVerified = (response.telegram_status && response.telegram_status.verified) || false;
            enhancedEarnState.steamVerified = (response.steam_status && response.steam_status.verified) || false;
            enhancedEarnState.passiveIncomePercent = stats.passive_income_percent || 0;
            
            updateProfileStatuses(response.telegram_status, response.steam_status);
        }
        
        await loadReferralInfo();
        
    } catch (error) {
        console.error('Ошибка загрузки данных заработка:', error);
    }
}

async function loadReferralInfo() {
    try {
        const response = await apiRequest('/api/earn/referral-info');
        
        if (response.success) {
            enhancedEarnState.referralLink = response.referral_link;
            
            const linkText = document.getElementById('referral-link-text');
            if (linkText) {
                linkText.textContent = response.referral_link;
            }
            
            const currentPassivePercent = document.getElementById('current-passive-percent');
            const passiveIncomeStatus = document.getElementById('passive-income-status');
            const passiveIncomeCard = document.getElementById('passive-income-card');
            
            if (response.passive_income && response.passive_income.percent !== undefined) {
                if (currentPassivePercent) currentPassivePercent.textContent = `${response.passive_income.percent}%`;
                
                if (response.passive_income.enabled) {
                    if (passiveIncomeStatus) {
                        passiveIncomeStatus.textContent = 'Активен';
                        passiveIncomeStatus.className = 'badge success';
                    }
                    if (passiveIncomeCard) passiveIncomeCard.classList.add('pulse');
                }
            }
        }
        
    } catch (error) {
        console.error('Ошибка загрузки реферальной информации:', error);
    }
}

function updateProfileStatuses(telegramStatus, steamStatus) {
    const telegramStatusBadge = document.getElementById('telegram-status-badge');
    const telegramLastnameCheck = document.getElementById('telegram-lastname-check');
    const telegramBioCheck = document.getElementById('telegram-bio-check');
    const checkTelegramBtn = document.getElementById('check-telegram-btn');
    
    if (telegramStatus && telegramStatus.verified) {
        if (telegramStatusBadge) telegramStatusBadge.innerHTML = '<span class="badge success">Проверено</span>';
        if (telegramLastnameCheck) telegramLastnameCheck.className = 'fas fa-check-circle success';
        if (telegramBioCheck) telegramBioCheck.className = 'fas fa-check-circle success';
        if (checkTelegramBtn) checkTelegramBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Перепроверить';
    } else {
        if (telegramStatusBadge) telegramStatusBadge.innerHTML = '<span class="badge pending">Не проверено</span>';
        if (telegramLastnameCheck) telegramLastnameCheck.className = 'fas fa-times-circle';
        if (telegramBioCheck) telegramBioCheck.className = 'fas fa-times-circle';
        if (checkTelegramBtn) checkTelegramBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Проверить';
    }
    
    const steamStatusBadge = document.getElementById('steam-status-badge');
    const checkSteamBtn = document.getElementById('check-steam-btn');
    const steamLevel = document.getElementById('steam-level');
    const steamGames = document.getElementById('steam-games');
    const steamBadges = document.getElementById('steam-badges');
    
    if (steamStatus && steamStatus.verified) {
        if (steamStatusBadge) steamStatusBadge.innerHTML = '<span class="badge success">Проверено</span>';
        if (checkSteamBtn) checkSteamBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Перепроверить';
        
        if (steamLevel) steamLevel.textContent = steamStatus.level || '-';
        if (steamGames) steamGames.textContent = steamStatus.game_count || '-';
        if (steamBadges) steamBadges.textContent = steamStatus.badges_count || '-';
    } else {
        if (steamStatusBadge) steamStatusBadge.innerHTML = '<span class="badge pending">Не проверено</span>';
        if (checkSteamBtn) checkSteamBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Проверить';
    }
}

async function checkTelegramProfile() {
    try {
        const response = await apiRequest('/api/earn/check-telegram', 'POST', {
            last_name: "rancasebot",
            bio: "Играй в CS2 с ботом @rancasebot!"
        });
        
        if (response.success) {
            if (response.reward_received) {
                showRewardNotification('Telegram профиль проверен!', response.rewards_available);
                appState.balance += response.rewards_available;
                updateUserInfo();
            }
            
            enhancedEarnState.telegramVerified = response.verified;
            updateProfileStatuses(
                { verified: response.verified },
                { verified: enhancedEarnState.steamVerified }
            );
            
            showToast(
                response.verified ? 'Успех!' : 'Требуется проверка',
                response.message,
                response.verified ? 'success' : 'warning'
            );
            
            await loadEarnData();
        }
        
    } catch (error) {
        console.error('Ошибка проверки Telegram профиля:', error);
        showToast('Ошибка', 'Не удалось проверить профиль', 'error');
    }
}

async function checkSteamProfile() {
    const steamInput = document.getElementById('steam-profile-input');
    const steamUrl = steamInput ? steamInput.value.trim() : '';
    
    if (!steamUrl && !enhancedEarnState.steamVerified) {
        showToast('Ошибка', 'Введите ссылку на Steam профиль', 'warning');
        return;
    }
    
    try {
        const response = await apiRequest('/api/earn/check-steam', 'POST', {
            steam_url: steamUrl || "https://steamcommunity.com/id/demo"
        });
        
        if (response.success) {
            if (response.reward_received) {
                showRewardNotification('Steam профиль проверен!', response.rewards_available);
                appState.balance += response.rewards_available;
                updateUserInfo();
            }
            
            const steamLevel = document.getElementById('steam-level');
            const steamGames = document.getElementById('steam-games');
            const steamBadges = document.getElementById('steam-badges');
            
            if (steamLevel) steamLevel.textContent = response.level;
            if (steamGames) steamGames.textContent = response.game_count;
            if (steamBadges) steamBadges.textContent = response.badges_count;
            
            enhancedEarnState.steamVerified = response.verified;
            updateProfileStatuses(
                { verified: enhancedEarnState.telegramVerified },
                { 
                    verified: response.verified,
                    level: response.level,
                    game_count: response.game_count,
                    badges_count: response.badges_count
                }
            );
            
            showToast(
                response.verified ? 'Успех!' : 'Требуется проверка',
                response.message,
                response.verified ? 'success' : 'warning'
            );
            
            await loadEarnData();
        }
        
    } catch (error) {
        console.error('Ошибка проверки Steam профиля:', error);
        showToast('Ошибка', 'Не удалось проверить профиль', 'error');
    }
}

async function inviteFriend() {
    try {
        const response = await apiRequest('/api/earn/invite-friend', 'POST', {
            friend_username: "demo_friend"
        });
        
        if (response.success) {
            showRewardNotification('Друг приглашен!', response.base_reward);
            
            if (response.milestone_bonus > 0) {
                setTimeout(() => {
                    showRewardNotification('Достижение!', response.milestone_bonus);
                }, 1500);
            }
            
            appState.balance = response.new_balance;
            updateUserInfo();
            
            if (response.passive_income_activated) {
                enhancedEarnState.passiveIncomePercent = response.passive_income_percent;
                const currentPassivePercent = document.getElementById('current-passive-percent');
                const passiveIncomeStatus = document.getElementById('passive-income-status');
                const passiveIncomeCard = document.getElementById('passive-income-card');
                
                if (currentPassivePercent) currentPassivePercent.textContent = `${response.passive_income_percent}%`;
                if (passiveIncomeStatus) {
                    passiveIncomeStatus.textContent = 'Активен';
                    passiveIncomeStatus.className = 'badge success';
                }
                if (passiveIncomeCard) passiveIncomeCard.classList.add('pulse');
            }
            
            await loadEarnData();
            
            showToast('Успех!', response.message, 'success');
        }
        
    } catch (error) {
        console.error('Ошибка приглашения друга:', error);
        showToast('Ошибка', 'Не удалось пригласить друга', 'error');
    }
}

function copyEnhancedReferralLink() {
    if (!enhancedEarnState.referralLink) {
        showToast('Ошибка', 'Ссылка не загружена', 'error');
        return;
    }
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(enhancedEarnState.referralLink)
            .then(() => showToast('Скопировано!', 'Реферальная ссылка скопирована', 'success'))
            .catch(err => {
                console.error('Ошибка копирования:', err);
                fallbackCopy(enhancedEarnState.referralLink);
            });
    } else {
        fallbackCopy(enhancedEarnState.referralLink);
    }
}

function showRewardNotification(title, amount) {
    const existingNotification = document.querySelector('.reward-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = 'reward-notification';
    notification.innerHTML = `
        <h3>${title}</h3>
        <div class="reward-amount">+${amount}</div>
        <p>баллов</p>
        <button class="close-case-btn" onclick="this.closest('.reward-notification').remove()">
            <i class="fas fa-times-circle"></i> Закрыть
        </button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// ===== ФУНКЦИИ ДЛЯ РЕФЕРАЛЬНОГО КОДА С ТАЙМЕРОМ =====
async function checkReferralCodeAvailability() {
    try {
        const response = await apiRequest('/api/can-use-referral');
        
        if (response.success) {
            const canUseReferral = response.can_use;
            const timeLeft = response.time_left;
            const minutesLeft = response.minutes_left;
            
            // Находим кнопку "Ввести Реферальный код"
            const referralBtn = document.getElementById('referral-code-btn');
            const referralSection = document.getElementById('referral-code-section');
            
            if (referralBtn && referralSection) {
                if (canUseReferral) {
                    // Показываем кнопку с таймером
                    const minutes = Math.floor(timeLeft / 60);
                    const seconds = Math.floor(timeLeft % 60);
                    referralBtn.innerHTML = `<i class="fas fa-key"></i> Ввести код (${minutes}:${seconds.toString().padStart(2, '0')})`;
                    referralSection.style.display = 'block';
                    referralBtn.classList.add('warning');
                    
                    // Обновляем каждую секунду
                    if (timeLeft > 0) {
                        setTimeout(checkReferralCodeAvailability, 1000);
                    } else {
                        referralSection.style.display = 'none';
                        referralBtn.classList.remove('warning');
                    }
                } else {
                    // Скрываем кнопку
                    referralSection.style.display = 'none';
                    referralBtn.classList.remove('warning');
                    
                    // Показываем сообщение если нужно
                    if (response.message && !response.demo_mode) {
                        console.log('Реферальный код недоступен:', response.message);
                    }
                }
            }
            
            return canUseReferral;
        }
        
        return false;
    } catch (error) {
        console.error('Ошибка проверки доступности реферального кода:', error);
        return false;
    }
}

async function showReferralCodeForm() {
    // Проверяем, можно ли еще вводить код
    const canUse = await checkReferralCodeAvailability();
    
    if (!canUse) {
        showToast('Время истекло', 'Реферальный код можно ввести только в первые 5 минут', 'warning');
        return;
    }
    
    const modal = document.getElementById('invite-friend-modal');
    if (modal) {
        modal.classList.remove('hidden');
        // Фокусируемся на поле ввода
        const input = document.getElementById('friend-referral-code');
        if (input) {
            setTimeout(() => input.focus(), 100);
        }
        
        // Обновляем таймер
        startReferralTimer();
    }
}

function startReferralTimer() {
    // Очищаем предыдущий интервал
    if (referralTimerInterval) {
        clearInterval(referralTimerInterval);
    }
    
    const updateTimerDisplay = async () => {
        const response = await apiRequest('/api/can-use-referral');
        if (response.success && response.can_use) {
            const minutesLeft = Math.floor(response.time_left / 60);
            const secondsLeft = Math.floor(response.time_left % 60);
            
            // Обновляем сообщение
            const message = document.getElementById('referral-time-message');
            if (message) {
                message.innerHTML = `Введите реферальный код друга в течение <strong>${minutesLeft}:${secondsLeft.toString().padStart(2, '0')}</strong>, чтобы получить 500 баллов`;
            }
            
            // Обновляем таймер
            const timer = document.getElementById('time-left');
            if (timer) {
                timer.textContent = `${minutesLeft}:${secondsLeft.toString().padStart(2, '0')}`;
            }
            
            // Если время вышло, закрываем модальное окно
            if (response.time_left <= 0) {
                clearInterval(referralTimerInterval);
                closeInviteModal();
                showToast('Время истекло', 'Реферальный код можно ввести только в первые 5 минут', 'warning');
            }
        } else {
            // Если нельзя больше использовать, закрываем окно
            clearInterval(referralTimerInterval);
            closeInviteModal();
        }
    };
    
    // Обновляем сразу и затем каждую секунду
    updateTimerDisplay();
    referralTimerInterval = setInterval(updateTimerDisplay, 1000);
}

async function useFriendReferralCode() {
    // Дополнительная проверка времени
    const canUse = await checkReferralCodeAvailability();
    
    if (!canUse) {
        showToast('Время истекло', 'Реферальный код можно ввести только в первые 5 минут', 'warning');
        closeInviteModal();
        return;
    }
    
    const input = document.getElementById('friend-referral-code');
    const friendCode = input ? input.value.trim() : '';
    
    if (!friendCode) {
        showToast('Ошибка', 'Введите реферальный код', 'warning');
        return;
    }
    
    try {
        const response = await apiRequest('/api/earn/invite-friend', 'POST', {
            referral_code: friendCode
        });
        
        if (response.success) {
            appState.balance = response.new_balance;
            updateUserInfo();
            
            closeInviteModal();
            if (input) input.value = '';
            
            showToast('Код активирован!', `+${response.base_reward} баллов`, 'success');
            
            // Сразу обновляем состояние кнопки
            await checkReferralCodeAvailability();
            
            await loadEarnData();
            
        } else {
            showToast('Ошибка', response.error || 'Неверный реферальный код', 'error');
        }
        
    } catch (error) {
        console.error('Ошибка активации кода:', error);
        showToast('Ошибка', 'Не удалось активировать код', 'error');
    }
}

function closeInviteModal() {
    // Очищаем таймер
    if (referralTimerInterval) {
        clearInterval(referralTimerInterval);
        referralTimerInterval = null;
    }
    
    const modal = document.getElementById('invite-friend-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function shareViaTelegram() {
    const referralLink = enhancedEarnState.referralLink || `https://t.me/rancasebot?start=${appState.referralCode}`;
    
    if (!referralLink) {
        showToast('Ошибка', 'Реферальная ссылка не найдена', 'error');
        return;
    }
    
    const shareText = `🎮 Присоединяйся к CS2 Skin Bot!\n\n✨ Открывай кейсы и получай скины бесплатно\n💰 Зарабатывай баллы и выводи предметы\n🎁 Ежедневные бонусы и промокоды\n\nПрисоединяйся по моей ссылке:`;
    
    if (typeof window.Telegram !== 'undefined' && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        
        try {
            const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;
            
            if (tg.openTelegramLink) {
                tg.openTelegramLink(telegramShareUrl);
            } else {
                window.open(telegramShareUrl, '_blank');
            }
            
            showToast('Telegram', 'Открываем для отправки ссылки', 'info');
            
        } catch (error) {
            console.error('Ошибка Telegram share:', error);
            
            const demoShareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;
            window.open(demoShareUrl, '_blank', 'noopener,noreferrer');
            showToast('Демо-режим', 'Открыта ссылка для Telegram', 'info');
        }
    } else {
        const demoShareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;
        window.open(demoShareUrl, '_blank', 'noopener,noreferrer');
        showToast('Демо-режим', 'Открыта ссылка для Telegram', 'info');
    }
}

function initEnhancedEarning() {
    const checkTelegramBtn = document.getElementById('check-telegram-btn');
    const checkSteamBtn = document.getElementById('check-steam-btn');
    const copyReferralLinkBtn = document.getElementById('copy-referral-link-btn');
    const shareTelegramBtn = document.getElementById('share-telegram-btn');
    
    if (checkTelegramBtn) {
        checkTelegramBtn.addEventListener('click', function() { 
            debounce(checkTelegramProfile); 
        });
    }
    
    if (checkSteamBtn) {
        checkSteamBtn.addEventListener('click', function() { 
            debounce(checkSteamProfile); 
        });
    }
    
    if (copyReferralLinkBtn) {
        copyReferralLinkBtn.addEventListener('click', function() { 
            debounce(copyEnhancedReferralLink); 
        });
    }
    
    if (shareTelegramBtn) {
        shareTelegramBtn.addEventListener('click', function() { 
            debounce(shareViaTelegram); 
        });
    }
    
    const steamInput = document.getElementById('steam-profile-input');
    if (steamInput) {
        steamInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') debounce(checkSteamProfile);
        });
    }
    
    // Обработчик для Enter в поле ввода кода друга
    const friendCodeInput = document.getElementById('friend-referral-code');
    if (friendCodeInput) {
        friendCodeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                debounce(useFriendReferralCode);
            }
        });
    }
    
    console.log("✅ Улучшенная система заработка инициализирована");
    
    // Проверяем доступность реферального кода
    setTimeout(() => {
        checkReferralCodeAvailability();
    }, 1000);
}

// ===== UI ФУНКЦИИ =====
function updateUserInfo() {
    if (appState.user) {
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = appState.user.firstName;
        }
        
        const balanceElement = document.getElementById('balance');
        if (balanceElement) {
            balanceElement.textContent = appState.balance;
        }
        
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
    
    let totalPrice = 0;
    
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
        const nextBonusTime = Date.now() + 86400000;
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
    const caseOpening = document.getElementById('case-opening');
    const openingText = document.getElementById('opening-text');
    
    if (caseOpening && openingText) {
        caseOpening.classList.remove('hidden');
        caseOpening.style.display = 'flex';
        openingText.textContent = 'Открываем кейс...';
        
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
    const caseOpening = document.getElementById('case-opening');
    if (caseOpening) {
        caseOpening.classList.add('hidden');
        caseOpening.style.display = 'none';
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
    const link = `https://t.me/rancasebot?start=${appState.referralCode}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link)
            .then(() => showToast('Скопировано!', 'Реферальная ссылка скопирована', 'success'))
            .catch(err => {
                console.error('Ошибка копирования:', err);
                fallbackCopy(link);
            });
    } else {
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
window.checkTelegramProfile = checkTelegramProfile;
window.checkSteamProfile = checkSteamProfile;
window.inviteFriend = inviteFriend;
window.copyEnhancedReferralLink = copyEnhancedReferralLink;
window.showReferralCodeForm = showReferralCodeForm;
window.closeInviteModal = closeInviteModal;
window.useFriendReferralCode = useFriendReferralCode;
window.shareViaTelegram = shareViaTelegram;

console.log("📦 CS2 Skin Bot скрипт загружен!");
