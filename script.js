// Telegram Web App SDK
const tg = window.Telegram.WebApp;

// Конфигурация API - ОБНОВИТЕ ЭТОТ URL!
const API_BASE_URL = "https://cs2-mini-app.onrender.com"; // Ваш текущий URL

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
    console.log("🚀 CS2 Skin Bot запускается...");
    console.log("🌐 API Base URL:", API_BASE_URL);
    
    // Инициализируем Telegram Web App
    initializeTelegramApp();
    
    // Настраиваем тему
    setupTheme();
    
    // Загружаем данные пользователя
    loadUserData();
    
    // Настраиваем обработчики событий
    setupEventListeners();
    
    // Обновляем таймер бонуса
    updateBonusTimer();
    setInterval(updateBonusTimer, 1000);
    
    // Тестовый запрос к API для проверки
    testAPIConnection();
});

// Тестирование подключения к API
async function testAPIConnection() {
    try {
        console.log("🔍 Проверка подключения к API...");
        const response = await fetch(`${API_BASE_URL}/api/health`);
        if (response.ok) {
            const data = await response.json();
            console.log("✅ API доступен:", data);
            return true;
        } else {
            console.error("❌ API недоступен, статус:", response.status);
            return false;
        }
    } catch (error) {
        console.error("❌ Ошибка подключения к API:", error);
        showToast('Ошибка API', 'Не удалось подключиться к серверу', 'error');
        return false;
    }
}

// Инициализация Telegram Web App
function initializeTelegramApp() {
    try {
        tg.ready();
        tg.expand(); // Раскрываем на весь экран
        
        // Получаем данные пользователя из Telegram
        const initData = tg.initDataUnsafe;
        
        console.log('📱 Telegram init data:', initData);
        
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
            console.log("👤 Пользователь авторизован:", appState.user.id);
        } else {
            console.warn("⚠️ Данные пользователя не получены");
            // Используем тестовые данные для демо
            useTestData();
        }
        
    } catch (error) {
        console.error('❌ Ошибка инициализации Telegram:', error);
        // Fallback к тестовым данным
        useTestData();
    }
}

// Функция для отправки запросов к API
async function apiRequest(endpoint, method = 'GET', data = null) {
    try {
        const headers = {
            'Content-Type': 'application/json',
        };
        
        // Добавляем авторизацию если есть данные Telegram
        if (tg && tg.initData) {
            headers['Authorization'] = `tma ${tg.initData}`;
        }
        
        const config = {
            method: method,
            headers: headers,
        };
        
        if (data && (method === 'POST' || method === 'PUT')) {
            config.body = JSON.stringify(data);
        }
        
        console.log(`🌐 API Request: ${method} ${API_BASE_URL}${endpoint}`);
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        console.log(`📨 API Response: ${response.status} ${endpoint}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ API Error ${response.status}:`, errorText);
            
            // Если ошибка авторизации, переходим в демо-режим
            if (response.status === 401 || response.status === 403) {
                console.warn("🔐 Ошибка авторизации, переходим в демо-режим");
                throw new Error("AUTH_ERROR");
            }
            
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log(`✅ API Success:`, result.success !== undefined ? result.success : true);
        return result;
        
    } catch (error) {
        console.error(`❌ API Error (${endpoint}):`, error);
        
        // Если ошибка авторизации или сети, используем демо-данные
        if (error.message === "AUTH_ERROR" || error.message.includes("Failed to fetch")) {
            throw new Error("DEMO_MODE");
        }
        
        throw error;
    }
}

// Загрузка данных пользователя
async function loadUserData() {
    try {
        showLoading();
        console.log("🔄 Загрузка данных пользователя...");
        
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
            updateProfileInfo();
            
            console.log("✅ Данные пользователя загружены:", appState.user.id);
            showToast('Добро пожаловать!', `Ваш баланс: ${appState.balance} баллов`, 'success');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных пользователя:', error);
        
        if (error.message === "DEMO_MODE") {
            // Автоматически переходим в демо-режим
            useTestData();
            showToast('Демо-режим', 'Используются демо-данные', 'info');
        } else {
            // Другая ошибка
            useTestData();
            showToast('Демо-режим', 'API временно недоступен', 'warning');
        }
    }
}

// Остальные функции остаются без изменений...

// В конце файла добавьте:
console.log("📦 CS2 Skin Bot скрипт загружен!");
