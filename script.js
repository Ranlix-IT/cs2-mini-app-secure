// Telegram Web App SDK
let tg;
let appState = {
    user: null,
    balance: 1000,
    inventory: [],
    dailyBonusAvailable: true,
    referralCode: "",
    tradeLink: "",
    referralsCount: 0,
    authType: "none" // "telegram", "browser", "demo", "none"
};

const API_BASE_URL = "https://cs2-mini-app.onrender.com";
const APP_VERSION = "2.1.0";

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

// Флаг для предотвращения двойных кликов
let isProcessing = false;

// Флаг авторизации
let isAuthenticated = false;

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 CS2 Skin Bot запускается...");
    
    // Проверка обновлений
    checkForUpdates();
    
    // Инициализация приложения
    initializeApp();
    
    // Настройка обработчиков событий
    setupEventListeners();
    
    // Обновление таймера бонуса
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
    
    // Проверяем авторизацию
    checkAuthStatus();
});

function initializeApp() {
    console.log("📱 Инициализация приложения...");
    
    // 1. Пробуем получить данные из Telegram Mini App
    if (typeof window.Telegram !== 'undefined' && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp;
        
        if (tg.initData || tg.initDataUnsafe?.user) {
            console.log("✅ Обнаружен Telegram Mini App");
            initializeTelegramApp();
            return;
        }
    }
    
    // 2. Проверяем браузерную авторизацию
    const savedAuth = localStorage.getItem('telegram_auth_data');
    if (savedAuth) {
        try {
            const authData = JSON.parse(savedAuth);
            console.log("✅ Обнаружена сохраненная браузерная авторизация");
            
            // Проверяем не устарели ли данные (больше 7 дней)
            const authDate = authData.auth_date;
            const now = Date.now();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            
            if (now - authDate < sevenDays) {
                appState.user = {
                    id: authData.user.id,
                    firstName: authData.user.first_name || 'Пользователь',
                    lastName: authData.user.last_name || '',
                    username: authData.user.username || `user_${authData.user.id}`
                };
                
                appState.authType = authData.demo_mode ? "demo" : "browser";
                isAuthenticated = true;
                
                updateUserInfo();
                updateAuthIndicator();
                
                // Загружаем данные пользователя
                setTimeout(() => {
                    loadUserData();
                }, 500);
                
                return;
            } else {
                console.log("❌ Данные авторизации устарели");
                localStorage.removeItem('telegram_auth_data');
            }
        } catch (e) {
            console.error("Ошибка загрузки сохраненной авторизации:", e);
            localStorage.removeItem('telegram_auth_data');
        }
    }
    
    // 3. Если нет авторизации, показываем кнопку входа
    console.log("⚠️ Требуется авторизация");
    showAuthButton();
}

function initializeTelegramApp() {
    try {
        tg.ready();
        tg.expand();
        
        console.log('📱 Telegram WebApp версия:', tg.version);
        console.log('📱 Telegram платформа:', tg.platform);
        
        // Используем initData для авторизации
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            const userData = tg.initDataUnsafe.user;
            appState.user = {
                id: userData.id,
                firstName: userData.first_name || 'Пользователь',
                lastName: userData.last_name || '',
                username: userData.username || `user_${userData.id}`,
                language_code: userData.language_code || 'ru'
            };
            
            appState.authType = "telegram";
            isAuthenticated = true;
            
            console.log("✅ Пользователь Telegram авторизован:", appState.user);
            
            // Обновляем UI
            updateUserInfo();
            updateAuthIndicator();
            
            // Загружаем данные с сервера
            setTimeout(() => {
                loadUserData();
            }, 500);
            
        } else {
            console.warn("⚠️ Данные пользователя Telegram не получены");
            // Показываем кнопку входа
            showAuthButton();
        }
        
        // Устанавливаем цветовую тему
        setTelegramTheme();
        
    } catch (error) {
        console.error('❌ Ошибка инициализации Telegram:', error);
        showAuthButton();
    }
}

function setTelegramTheme() {
    if (tg) {
        const primaryColor = tg.themeParams.button_color || '#667eea';
        const bgColor = tg.themeParams.bg_color || '#1a202c';
        const textColor = tg.themeParams.text_color || '#ffffff';
        
        document.documentElement.style.setProperty('--primary-color', primaryColor);
        document.documentElement.style.setProperty('--secondary-color', primaryColor);
        document.documentElement.style.setProperty('--dark-bg', bgColor);
        document.documentElement.style.setProperty('--dark-card', '#2d3748');
        document.documentElement.style.setProperty('--text-light', textColor);
        
        if (tg.colorScheme === 'dark') {
            document.body.classList.add('telegram-dark');
        } else {
            document.body.classList.add('telegram-light');
        }
    }
}

function showAuthButton() {
    // Показываем кнопку входа в правом нижнем углу
    const loginBtn = document.getElementById('login-corner-btn');
    if (loginBtn) {
        loginBtn.style.display = 'flex';
        
        // Обновляем индикатор авторизации
        updateAuthIndicator();
    }
}

function updateAuthIndicator() {
    const indicator = document.getElementById('auth-indicator');
    const statusText = document.getElementById('auth-status');
    
    if (!indicator || !statusText) return;
    
    if (isAuthenticated) {
        indicator.style.display = 'flex';
        indicator.classList.remove('unauthorized');
        
        let authText = '';
        switch(appState.authType) {
            case 'telegram':
                authText = `Telegram: ${appState.user?.firstName || 'Пользователь'}`;
                break;
            case 'browser':
                authText = `Браузер: ${appState.user?.firstName || 'Пользователь'}`;
                break;
            case 'demo':
                authText = 'Демо-режим';
                break;
            default:
                authText = 'Авторизован';
        }
        
        statusText.textContent = authText;
    } else {
        indicator.style.display = 'flex';
        indicator.classList.add('unauthorized');
        statusText.textContent = 'Не авторизован';
    }
}

function checkAuthStatus() {
    // Проверяем авторизацию каждые 30 секунд
    setInterval(() => {
        if (!isAuthenticated) {
            const savedAuth = localStorage.getItem('telegram_auth_data');
            if (savedAuth) {
                try {
                    const authData = JSON.parse(savedAuth);
                    const authDate = authData.auth_date;
                    const now = Date.now();
                    const sevenDays = 7 * 24 * 60 * 60 * 1000;
                    
                    if (now - authDate < sevenDays) {
                        // Обновляем состояние
                        appState.user = {
                            id: authData.user.id,
                            firstName: authData.user.first_name || 'Пользователь',
                            lastName: authData.user.last_name || '',
                            username: authData.user.username || `user_${authData.user.id}`
                        };
                        
                        appState.authType = authData.demo_mode ? "demo" : "browser";
                        isAuthenticated = true;
                        
                        updateUserInfo();
                        updateAuthIndicator();
                        
                        console.log("✅ Авторизация восстановлена");
                    }
                } catch (e) {
                    console.error("Ошибка проверки авторизации:", e);
                }
            }
        }
    }, 30000);
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====
function setupEventListeners() {
    console.log("🔧 Настройка обработчиков событий...");
    
    // Кнопка входа
    const loginBtn = document.getElementById('login-corner-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', showAuthModal);
    }
    
    // Модальное окно авторизации
    const authModal = document.getElementById('auth-modal');
    const closeAuthModal = document.getElementById('close-auth-modal');
    const demoAuthBtn = document.getElementById('demo-auth-btn');
    
    if (closeAuthModal) {
        closeAuthModal.addEventListener('click', hideAuthModal);
    }
    
    if (demoAuthBtn) {
        demoAuthBtn.addEventListener('click', useDemoAuth);
    }
    
    // Слушаем сообщения от окна авторизации Telegram
    window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'telegram_auth_success') {
            console.log('✅ Получены данные Telegram от виджета:', event.data);
            
            handleAuthSuccess(event.data.data);
            hideAuthModal();
        }
    });
    
    // Кнопка выхода
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // Остальные обработчики...
    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) {
        menuBtn.addEventListener('click', toggleMenu);
    }
    
    const menuCloseBtn = document.getElementById('menu-close-btn');
    if (menuCloseBtn) {
        menuCloseBtn.addEventListener('click', function() { 
            toggleMenu(false); 
        });
    }
    
    const menuOverlay = document.getElementById('menu-overlay');
    if (menuOverlay) {
        menuOverlay.addEventListener('click', function() { 
            toggleMenu(false); 
        });
    }
    
    const actionButtons = document.querySelectorAll('.action-btn');
    actionButtons.forEach(button => {
        button.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            if (section) {
                openSection(section);
            }
        });
    });
    
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
    
    const dailyBonusBtn = document.getElementById('daily-bonus-btn');
    if (dailyBonusBtn) {
        dailyBonusBtn.addEventListener('click', function() { 
            debounce(claimDailyBonus); 
        });
    }
    
    document.querySelectorAll('.page-section .back-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            debounce(backToMain);
        });
    });
    
    const closeCaseBtn = document.getElementById('close-case-btn');
    if (closeCaseBtn) {
        closeCaseBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            debounce(closeCaseOpening);
        });
    }
    
    const promoBtn = document.getElementById('activate-promo-btn');
    if (promoBtn) {
        promoBtn.addEventListener('click', function() { 
            debounce(activatePromoCode); 
        });
    }
    
    const tradeLinkBtn = document.getElementById('save-trade-link-btn');
    if (tradeLinkBtn) {
        tradeLinkBtn.addEventListener('click', function() { 
            debounce(setTradeLink); 
        });
    }
    
    const copyRefBtn = document.getElementById('copy-ref-link-btn');
    if (copyRefBtn) {
        copyRefBtn.addEventListener('click', function() { 
            debounce(copyReferralLink); 
        });
    }
    
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
    
    const promoInput = document.getElementById('promo-code-input');
    if (promoInput) {
        promoInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') debounce(activatePromoCode);
        });
    }
    
    const tradeInput = document.getElementById('trade-link-input');
    if (tradeInput) {
        tradeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') debounce(setTradeLink);
        });
    }
    
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
    
    console.log("✅ Обработчики событий установлены");
}

function showAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function hideAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function useDemoAuth() {
    console.log("🎭 Использование демо-авторизации");
    
    const demoUser = {
        id: Date.now() % 1000000,
        first_name: 'Демо',
        last_name: 'Пользователь',
        username: `demo_${Date.now()}`
    };
    
    const authData = {
        user: demoUser,
        auth_date: Date.now(),
        valid: true,
        browser_auth: true,
        demo_mode: true
    };
    
    handleAuthSuccess(authData);
    hideAuthModal();
}

function handleAuthSuccess(authData) {
    console.log("✅ Обработка успешной авторизации");
    
    // Сохраняем данные
    localStorage.setItem('telegram_auth_data', JSON.stringify(authData));
    
    // Обновляем состояние приложения
    appState.user = {
        id: authData.user.id,
        firstName: authData.user.first_name || 'Пользователь',
        lastName: authData.user.last_name || '',
        username: authData.user.username || `user_${authData.user.id}`
    };
    
    appState.authType = authData.demo_mode ? "demo" : "browser";
    isAuthenticated = true;
    
    // Обновляем UI
    updateUserInfo();
    updateAuthIndicator();
    
    // Скрываем кнопку входа
    const loginBtn = document.getElementById('login-corner-btn');
    if (loginBtn) {
        loginBtn.style.display = 'none';
    }
    
    // Загружаем данные пользователя
    loadUserData();
    
    showToast('Авторизация успешна', `Добро пожаловать, ${appState.user.firstName}!`, 'success');
}

function logout() {
    console.log("🚪 Выход из аккаунта");
    
    // Очищаем данные
    localStorage.removeItem('telegram_auth_data');
    
    // Сбрасываем состояние
    appState = {
        user: null,
        balance: 1000,
        inventory: [],
        dailyBonusAvailable: true,
        referralCode: "",
        tradeLink: "",
        referralsCount: 0,
        authType: "none"
    };
    
    isAuthenticated = false;
    
    // Обновляем UI
    updateUserInfo();
    updateAuthIndicator();
    
    // Показываем кнопку входа
    const loginBtn = document.getElementById('login-corner-btn');
    if (loginBtn) {
        loginBtn.style.display = 'flex';
    }
    
    // Возвращаем на главную
    backToMain();
    
    showToast('Вы вышли из аккаунта', 'Для доступа ко всем функциям войдите снова', 'info');
}

// ===== API ФУНКЦИИ =====
async function apiRequest(endpoint, method = 'GET', data = null) {
    try {
        const headers = {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        };
        
        // Добавляем заголовки авторизации
        const savedAuth = localStorage.getItem('telegram_auth_data');
        if (savedAuth) {
            try {
                const authData = JSON.parse(savedAuth);
                if (authData.user && authData.user.id) {
                    headers['X-Telegram-User-ID'] = authData.user.id;
                    headers['X-Browser-Auth'] = 'true';
                    console.log('🔐 Используем браузерную авторизацию');
                }
            } catch (e) {
                console.error('Ошибка парсинга сохраненной авторизации:', e);
            }
        }
        
        // Для Telegram Mini App
        if (window.Telegram?.WebApp?.initData) {
            headers['Authorization'] = `tma ${window.Telegram.WebApp.initData}`;
            console.log('🔐 Используем Telegram Mini App авторизацию');
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
        
        console.log(`🌐 API Request: ${method} ${endpoint}`);
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        console.log(`📨 API Response: ${response.status} ${endpoint}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ API Error ${response.status}:`, errorText);
            
            // Если ошибка авторизации, предлагаем войти
            if (response.status === 401) {
                console.warn('🔐 Ошибка авторизации 401');
                
                // Для некоторых endpoints используем демо-режим
                const demoEndpoints = ['/api/health', '/api/available-promos', '/api/test'];
                if (demoEndpoints.some(ep => endpoint.includes(ep))) {
                    return simulateAPIResponse(endpoint, method, data);
                }
                
                // Для других предлагаем авторизацию
                if (!endpoint.includes('/api/health')) {
                    setTimeout(() => {
                        if (!isAuthenticated) {
                            showAuthModal();
                            showToast('Требуется авторизация', 'Войдите для доступа к этой функции', 'warning');
                        }
                    }, 500);
                }
            }
            
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        return await response.json();
        
    } catch (error) {
        console.error(`❌ API Error (${endpoint}):`, error);
        
        // Для публичных endpoints возвращаем демо-данные
        const publicEndpoints = ['/api/health', '/api/available-promos', '/api/test'];
        if (publicEndpoints.some(ep => endpoint.includes(ep))) {
            return simulateAPIResponse(endpoint, method, data);
        }
        
        throw error;
    }
}

// Симуляция API ответов для демо-режима
function simulateAPIResponse(endpoint, method, data) {
    console.log(`🎭 Симуляция API ответа для: ${endpoint}`);
    
    // Базовые демо-данные
    const demoUser = {
        id: appState.user ? appState.user.id : 1003215844,
        first_name: appState.user ? appState.user.firstName : 'Демо',
        last_name: appState.user ? appState.user.lastName : 'Пользователь',
        username: appState.user ? appState.user.username : 'demo_user'
    };
    
    switch(endpoint) {
        case '/api/user':
            return Promise.resolve({
                success: true,
                user: {
                    id: 1,
                    telegram_id: demoUser.id,
                    username: demoUser.username,
                    first_name: demoUser.first_name,
                    last_name: demoUser.last_name,
                    balance: appState.balance,
                    points: appState.balance,
                    referral_code: `ref_${demoUser.id}_demo`,
                    trade_link: appState.tradeLink || "",
                    created_at: time.time() - 86400,
                    is_subscribed: true
                },
                stats: {
                    total_earned: appState.balance + 500,
                    referral_earnings: 500,
                    telegram_earnings: enhancedEarnState.telegramVerified ? 500 : 0,
                    steam_earnings: enhancedEarnState.steamVerified ? 1000 : 0,
                    total_cases_opened: 5,
                    total_spent: 2500,
                    inventory_count: appState.inventory.length,
                    inventory_value: appState.inventory.reduce((sum, item) => sum + (item.price || 0), 0)
                },
                referral_info: {
                    referral_code: `ref_${demoUser.id}_demo`,
                    referral_link: `https://t.me/rancasebot?start=ref_${demoUser.id}_demo`,
                    total_referrals: 3,
                    active_referrals: 3
                },
                inventory: appState.inventory,
                daily_bonus_available: appState.dailyBonusAvailable,
                telegram_profile_verified: enhancedEarnState.telegramVerified,
                steam_profile_verified: enhancedEarnState.steamVerified,
                demo_mode: true,
                auth_type: "demo"
            });
            
        // ... остальные симуляции ...
        // (open_case, daily_bonus, activate_promo и т.д. аналогично предыдущей версии)
    }
    
    return Promise.resolve({
        success: true,
        message: "Демо-режим: операция выполнена",
        demo_mode: true
    });
}

async function loadUserData() {
    if (!isAuthenticated) {
        console.log("⚠️ Пользователь не авторизован, используем демо-данные");
        useDemoData();
        return;
    }
    
    try {
        console.log("🔄 Загрузка данных пользователя...");
        const response = await apiRequest('/api/user');
        
        if (response.success) {
            // Обновляем состояние приложения
            appState.balance = response.user.points || response.user.balance || 1000;
            appState.inventory = response.inventory || [];
            appState.dailyBonusAvailable = response.daily_bonus_available || true;
            appState.referralCode = response.user.referral_code || `ref_${response.user.telegram_id}`;
            appState.tradeLink = response.user.trade_link || "";
            
            if (response.stats) {
                appState.referralsCount = response.stats.referrals_count || response.referral_info?.total_referrals || 0;
            }
            
            if (response.telegram_profile_verified !== undefined) {
                enhancedEarnState.telegramVerified = response.telegram_profile_verified;
            }
            if (response.steam_profile_verified !== undefined) {
                enhancedEarnState.steamVerified = response.steam_profile_verified;
            }
            
            // Обновляем UI
            updateUserInfo();
            updateInventoryUI();
            updateProfileInfo();
            
            // Обновляем реферальную информацию
            if (response.referral_info) {
                enhancedEarnState.referralLink = response.referral_info.referral_link;
                const linkText = document.getElementById('referral-link-text');
                if (linkText) {
                    linkText.textContent = response.referral_info.referral_link;
                }
            }
            
            showToast('Добро пожаловать!', `Баланс: ${appState.balance} баллов`, 'success');
            
            // Проверяем доступность реферального кода
            setTimeout(() => {
                checkReferralCodeAvailability();
            }, 1000);
            
        } else if (response.demo_mode) {
            console.log('🎭 Используем демо-данные');
            useDemoData();
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error);
        useDemoData();
    }
}

function useDemoData() {
    console.log("🔧 Используем демо-данные");
    
    const demoId = appState.user ? appState.user.id : 1003215844;
    
    appState.user = {
        id: demoId,
        firstName: 'Демо',
        lastName: 'Пользователь',
        username: 'demo_user'
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
    appState.referralCode = `ref_${demoId}_demo`;
    appState.referralsCount = 3;
    appState.tradeLink = "https://steamcommunity.com/tradeoffer/new/partner=123456789";
    appState.authType = "demo";
    isAuthenticated = true;
    
    updateUserInfo();
    updateInventoryUI();
    updateProfileInfo();
    updateAuthIndicator();
    
    enhancedEarnState.referralLink = `https://t.me/rancasebot?start=ref_${demoId}_demo`;
    const linkText = document.getElementById('referral-link-text');
    if (linkText) {
        linkText.textContent = enhancedEarnState.referralLink;
    }
    
    // Скрываем кнопку входа
    const loginBtn = document.getElementById('login-corner-btn');
    if (loginBtn) {
        loginBtn.style.display = 'none';
    }
    
    showToast('Демо-режим', 'Используются демо-данные. Войдите для полного доступа.', 'info');
}

// ===== ОСТАЛЬНЫЕ ФУНКЦИИ =====
// (openCase, claimDailyBonus, activatePromoCode, setTradeLink, withdrawItem,
//  loadAvailablePromos, testAPIConnection, loadEarnData, checkTelegramProfile,
//  checkSteamProfile, copyEnhancedReferralLink, checkReferralCodeAvailability,
//  showReferralCodeForm, startReferralTimer, useFriendReferralCode,
//  closeInviteModal, shareViaTelegram, initEnhancedEarning, updateUserInfo,
//  updateInventoryUI, updateProfileInfo, updatePromoList, updateBonusTimer,
//  openSection, backToMain, toggleMenu, showCaseOpening, showWonItem,
//  closeCaseOpening, showToast, copyReferralLink, fallbackCopy, closeApp,
//  debugTelegramData и другие функции)

// ... остальной код остается аналогичным предыдущей версии с небольшими изменениями ...

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ =====
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
window.copyEnhancedReferralLink = copyEnhancedReferralLink;
window.showReferralCodeForm = showReferralCodeForm;
window.closeInviteModal = closeInviteModal;
window.useFriendReferralCode = useFriendReferralCode;
window.shareViaTelegram = shareViaTelegram;
window.debugTelegramData = debugTelegramData;
window.showAuthModal = showAuthModal;
window.hideAuthModal = hideAuthModal;
window.logout = logout;

console.log("📦 CS2 Skin Bot скрипт загружен v2.1.0!");

// === DEBUG UTILITIES ===
if (typeof window !== 'undefined') {
    window.debugTelegram = function() {
        if (!window.Telegram || !window.Telegram.WebApp) {
            console.error("❌ Telegram SDK не загружен");
            return null;
        }
        
        const tg = window.Telegram.WebApp;
        const debugInfo = {
            platform: tg.platform,
            version: tg.version,
            hasInitData: !!tg.initData,
            initDataLength: tg.initData?.length || 0,
            user: tg.initDataUnsafe?.user,
            authDate: tg.initDataUnsafe?.auth_date,
            themeParams: tg.themeParams
        };
        
        console.table(debugInfo);
        return debugInfo;
    };
    
    window.testAuth = function() {
        console.log("🧪 Testing authentication...");
        console.log("isAuthenticated:", isAuthenticated);
        console.log("appState.authType:", appState.authType);
        console.log("appState.user:", appState.user);
        console.log("localStorage telegram_auth_data:", localStorage.getItem('telegram_auth_data'));
        
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;
            console.log("Telegram WebApp initData:", tg.initData ? "Present" : "Missing");
            console.log("Telegram WebApp user:", tg.initDataUnsafe?.user);
        }
    };
    
    console.log("🔧 Debug commands available:");
    console.log("  - debugTelegram() - Show Telegram data");
    console.log("  - testAuth() - Test authentication status");
    console.log("  - testAPI() - Test API endpoints");
}
