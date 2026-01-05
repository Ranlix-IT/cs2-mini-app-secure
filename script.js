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

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

function debounce(func, delay = 300) {
    if (isProcessing) return;
    
    isProcessing = true;
    func();
    
    setTimeout(() => {
        isProcessing = false;
    }, delay);
}

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
    const keepKeys = ['user_preferences', 'app_version', 'last_update', 'telegram_auth_data'];
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
            if (data.version && data.version !== APP_VERSION) {
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

// ===== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ =====

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

// ===== УПРАВЛЕНИЕ АВТОРИЗАЦИЕЙ =====

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
    
    console.log("✅ Обработчики событий установлены");
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
                    created_at: Date.now() / 1000 - 86400,
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
            
        case '/api/earn/check-telegram':
            if (method === 'POST') {
                if (!enhancedEarnState.telegramVerified) {
                    enhancedEarnState.telegramVerified = true;
                    appState.balance += 500;
                    updateUserInfo();
                    return Promise.resolve({
                        success: true,
                        verified: true,
                        has_bot_in_lastname: true,
                        has_bot_in_bio: true,
                        first_verification: true,
                        telegram_earnings: 500,
                        message: "Telegram профиль подтвержден! +500 баллов"
                    });
                }
                return Promise.resolve({
                    success: true,
                    verified: true,
                    has_bot_in_lastname: true,
                    has_bot_in_bio: true,
                    first_verification: false,
                    telegram_earnings: 500,
                    message: "Telegram профиль проверен"
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
                        steam_id: "76561198000000000",
                        level: 10,
                        games: 42,
                        badges: 7,
                        age_days: 365,
                        first_verification: true,
                        steam_earnings: 1000,
                        message: "Steam профиль подтвержден! +1000 баллов"
                    });
                }
                return Promise.resolve({
                    success: true,
                    verified: true,
                    steam_id: "76561198000000000",
                    level: 10,
                    games: 42,
                    badges: 7,
                    age_days: 365,
                    first_verification: false,
                    steam_earnings: 1000,
                    message: "Steam профиль проверен"
                });
            }
            break;
            
        case '/api/earn/invite-friend':
            if (method === 'POST' && data && data.referral_code) {
                appState.balance += 500;
                appState.referralsCount += 1;
                updateUserInfo();
                
                const totalInvites = appState.referralsCount;
                let milestoneBonus = 0;
                
                if (totalInvites === 5) {
                    milestoneBonus = 1000;
                    appState.balance += milestoneBonus;
                }
                
                return Promise.resolve({
                    success: true,
                    bonus_awarded: 500,
                    milestone_bonus: milestoneBonus,
                    to_user_id: 1,
                    new_balance: appState.balance,
                    referral_info: {
                        total_referrals: totalInvites,
                        active_referrals: totalInvites,
                        referral_code: appState.referralCode,
                        referral_link: `https://t.me/rancasebot?start=${appState.referralCode}`
                    },
                    message: `Вы успешно присоединились по реферальной ссылке! Пригласивший получил 500 баллов`
                });
            }
            break;
            
        case '/api/earn/referral-info':
            const totalInvites = appState.referralsCount;
            const referralCode = appState.referralCode || `ref_${appState.user ? appState.user.id : 1003215844}_demo`;
            
            return Promise.resolve({
                success: true,
                referral_code: referralCode,
                referral_link: `https://t.me/rancasebot?start=${referralCode}`,
                total_referrals: totalInvites,
                active_referrals: totalInvites,
                total_earned: 1500,
                referral_tier: 0,
                milestones: [
                    { invites: 5, bonus: 1000, badge: "🎖️ Начинающий" },
                    { invites: 10, bonus: 2500, badge: "🥉 Бронзовый агент" }
                ],
                demo_mode: true
            });
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

// ===== ОСНОВНЫЕ ФУНКЦИИ ПРИЛОЖЕНИЯ =====

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
        const response = await apiRequest('/api/earn/referral-info');
        
        if (response.success) {
            const stats = response.stats || {
                total_earned: 1500,
                referral_earnings: 500,
                telegram_earnings: enhancedEarnState.telegramVerified ? 500 : 0,
                steam_earnings: enhancedEarnState.steamVerified ? 1000 : 0
            };
            
            const totalEarned = document.getElementById('total-earned');
            const totalInvites = document.getElementById('total-invites');
            const telegramEarned = document.getElementById('telegram-earned');
            const steamEarned = document.getElementById('steam-earned');
            
            if (totalEarned) totalEarned.textContent = stats.total_earned || 0;
            if (totalInvites) totalInvites.textContent = response.total_referrals || 0;
            if (telegramEarned) telegramEarned.textContent = stats.telegram_earnings || 0;
            if (steamEarned) steamEarned.textContent = stats.steam_earnings || 0;
            
            // Обновляем реферальную ссылку
            enhancedEarnState.referralLink = response.referral_link;
            const linkText = document.getElementById('referral-link-text');
            if (linkText) {
                linkText.textContent = response.referral_link;
            }
            
            // Обновляем реферальный код в профиле
            appState.referralCode = response.referral_code;
            updateProfileInfo();
            
            // Обновляем прогресс
            if (response.progress_percent !== undefined) {
                const progressBar = document.getElementById('referral-progress-bar');
                const currentInvites = document.getElementById('current-invites');
                const nextMilestone = document.getElementById('next-milestone');
                const nextMilestoneText = document.getElementById('next-milestone-text');
                const nextMilestoneReward = document.getElementById('next-milestone-reward');
                
                if (progressBar) progressBar.style.width = `${response.progress_percent}%`;
                if (currentInvites) currentInvites.textContent = response.total_referrals || 0;
                
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
            enhancedEarnState.progressPercent = response.progress_percent || 0;
            
            // Обновляем статусы профилей
            updateProfileStatuses();
        }
        
    } catch (error) {
        console.error('Ошибка загрузки данных заработка:', error);
    }
}

function updateProfileStatuses() {
    const telegramStatusBadge = document.getElementById('telegram-status-badge');
    const telegramLastnameCheck = document.getElementById('telegram-lastname-check');
    const telegramBioCheck = document.getElementById('telegram-bio-check');
    const checkTelegramBtn = document.getElementById('check-telegram-btn');
    
    if (enhancedEarnState.telegramVerified) {
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
    
    if (enhancedEarnState.steamVerified) {
        if (steamStatusBadge) steamStatusBadge.innerHTML = '<span class="badge success">Проверено</span>';
        if (checkSteamBtn) checkSteamBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Перепроверить';
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
            if (response.first_verification) {
                showRewardNotification('Telegram профиль проверен!', response.telegram_earnings);
                appState.balance += response.telegram_earnings;
                updateUserInfo();
            }
            
            enhancedEarnState.telegramVerified = response.verified;
            updateProfileStatuses();
            
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
            if (response.first_verification) {
                showRewardNotification('Steam профиль проверен!', response.steam_earnings);
                appState.balance += response.steam_earnings;
                updateUserInfo();
            }
            
            const steamLevel = document.getElementById('steam-level');
            const steamGames = document.getElementById('steam-games');
            const steamBadges = document.getElementById('steam-badges');
            
            if (steamLevel) steamLevel.textContent = response.level;
            if (steamGames) steamGames.textContent = response.games;
            if (steamBadges) steamBadges.textContent = response.badges;
            
            enhancedEarnState.steamVerified = response.verified;
            updateProfileStatuses();
            
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

function copyEnhancedReferralLink() {
    if (!enhancedEarnState.referralLink && appState.referralCode) {
        enhancedEarnState.referralLink = `https://t.me/rancasebot?start=${appState.referralCode}`;
    }
    
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
            appState.referralsCount = response.referral_info.total_referrals;
            updateUserInfo();
            updateProfileInfo();
            
            closeInviteModal();
            if (input) input.value = '';
            
            showToast('Код активирован!', `+${response.bonus_awarded} баллов`, 'success');
            
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
    const referralLink = enhancedEarnState.referralLink || 
                        (appState.referralCode ? `https://t.me/rancasebot?start=${appState.referralCode}` : '');
    
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
    const referralCodeBtn = document.getElementById('referral-code-btn');
    
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
    
    if (referralCodeBtn) {
        referralCodeBtn.addEventListener('click', function() { 
            debounce(showReferralCodeForm); 
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
    
    appState.inventory.forEach((item) => {
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
    if (profileRefCode) profileRefCode.textContent = appState.referralCode || 'Загрузка...';
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

function copyReferralLink() {
    const link = enhancedEarnState.referralLink || 
                (appState.referralCode ? `https://t.me/rancasebot?start=${appState.referralCode}` : '');
    
    if (!link) {
        showToast('Ошибка', 'Реферальная ссылка не найдена', 'error');
        return;
    }
    
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
    
    window.testAPI = async function() {
        console.log("🧪 Testing API...");
        
        try {
            // Test without auth
            const health = await fetch('/api/health');
            console.log("✅ /api/health:", await health.json());
            
            // Test with Telegram auth
            if (window.Telegram?.WebApp?.initData) {
                const user = await fetch('/api/user', {
                    headers: { 'Authorization': `tma ${window.Telegram.WebApp.initData}` }
                });
                console.log("✅ /api/user status:", user.status);
                if (user.ok) {
                    console.log("✅ /api/user data:", await user.json());
                }
            }
        } catch (error) {
            console.error("❌ API test failed:", error);
        }
    };
    
    console.log("🔧 Debug commands available:");
    console.log("  - debugTelegram() - Show Telegram data");
    console.log("  - testAuth() - Test authentication status");
    console.log("  - testAPI() - Test API endpoints");
}
