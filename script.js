// Telegram Web App SDK
let tg;
let appState = {
    user: null,
    balance: 0,
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
    
    // Загружаем данные через 500ms чтобы Telegram успел инициализироваться
    setTimeout(loadUserData, 500);
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
        
        console.log('📱 Telegram init data:', tg.initDataUnsafe);
        
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            appState.user = {
                id: tg.initDataUnsafe.user.id,
                firstName: tg.initDataUnsafe.user.first_name || 'Пользователь',
                lastName: tg.initDataUnsafe.user.last_name || '',
                username: tg.initDataUnsafe.user.username || ''
            };
            
            console.log("✅ Пользователь авторизован:", appState.user.id);
        } else {
            console.warn("⚠️ Данные пользователя не получены");
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
    
    appState.balance = 1000;
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
        }
    ];
    
    appState.dailyBonusAvailable = true;
    appState.referralCode = `ref_${appState.user.id}_${Date.now()}`;
    appState.referralsCount = 3;
    
    updateUserInfo();
    updateInventoryUI();
    updateProfileInfo();
    
    showToast('Демо-режим', 'Используются тестовые данные', 'info');
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====
function setupEventListeners() {
    console.log("🔧 Настройка обработчиков событий...");
    
    // Кнопки навигации в главном меню
    const actionButtons = document.querySelectorAll('.action-btn');
    actionButtons.forEach(button => {
        button.addEventListener('click', function() {
            const section = this.getAttribute('data-section') || 
                           this.getAttribute('onclick')?.match(/openSection\('(.*?)'\)/)?.[1];
            if (section) {
                openSection(section);
            }
        });
    });
    
    // Кнопки открытия кейсов
    document.querySelectorAll('.case-card, .open-case-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const caseCard = this.closest('.case-card') || this;
            const price = caseCard.getAttribute('data-price');
            if (price) {
                openCase(parseInt(price));
            }
        });
    });
    
    // Кнопка ежедневного бонуса
    const dailyBonusBtn = document.getElementById('daily-bonus-btn');
    if (dailyBonusBtn) {
        dailyBonusBtn.addEventListener('click', claimDailyBonus);
    }
    
    // Кнопка меню
    const menuBtn = document.querySelector('.menu-btn');
    if (menuBtn) {
        menuBtn.addEventListener('click', toggleMenu);
    }
    
    // Кнопки назад
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', backToMain);
    });
    
    // Активация промокода
    const promoBtn = document.querySelector('.promo-submit-btn');
    if (promoBtn) {
        promoBtn.addEventListener('click', activatePromoCode);
    }
    
    // Сохранение трейд ссылки
    const tradeLinkBtn = document.querySelector('.trade-link-submit-btn');
    if (tradeLinkBtn) {
        tradeLinkBtn.addEventListener('click', setTradeLink);
    }
    
    // Копирование реферальной ссылки
    const referralBtn = document.querySelector('.referral-btn');
    if (referralBtn) {
        referralBtn.addEventListener('click', copyReferralLink);
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
    
    console.log("✅ Обработчики событий установлены");
}

// ===== НАВИГАЦИЯ =====
function openSection(sectionName) {
    console.log(`📱 Открываем раздел: ${sectionName}`);
    
    // Скрываем основной контент
    const mainSections = document.querySelector('.main-content').children;
    for (let element of mainSections) {
        if (!element.classList.contains('page-section')) {
            element.style.display = 'none';
        }
    }
    
    // Скрываем все секции
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Показываем выбранную секцию
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) {
        targetSection.classList.remove('hidden');
        targetSection.style.display = 'block';
        
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
    const mainSections = document.querySelector('.main-content').children;
    for (let element of mainSections) {
        if (!element.classList.contains('page-section')) {
            element.style.display = 'block';
        }
    }
    
    // Скрываем все секции
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.add('hidden');
        section.style.display = 'none';
    });
}

function toggleMenu(show) {
    const menu = document.getElementById('side-menu');
    if (menu) {
        if (typeof show === 'boolean') {
            menu.classList.toggle('active', show);
        } else {
            menu.classList.toggle('active');
        }
        
        // Блокируем прокрутку при открытом меню
        document.body.style.overflow = menu.classList.contains('active') ? 'hidden' : '';
    }
}

// ===== API ФУНКЦИИ =====
async function apiRequest(endpoint, method = 'GET', data = null) {
    try {
        const headers = {
            'Content-Type': 'application/json',
        };
        
        // Добавляем авторизацию из Telegram
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
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
        
    } catch (error) {
        console.error(`❌ API Error (${endpoint}):`, error);
        throw error;
    }
}

async function loadUserData() {
    try {
        console.log("🔄 Загрузка данных пользователя...");
        
        const response = await apiRequest('/api/user');
        
        if (response.success) {
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
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error);
        // Уже используем тестовые данные
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
        const response = await apiRequest('/api/withdraw-item', 'POST', { 
            item_id: itemId 
        });
        
        if (response.success) {
            // Обновляем инвентарь
            appState.inventory = appState.inventory.filter(item => item.id !== itemId);
            updateInventoryUI();
            
            showToast('Успех!', 'Запрос на вывод отправлен', 'success');
        } else {
            if (response.requires_trade_link) {
                openSection('profile');
                showToast('Требуется ссылка', 'Укажите трейд ссылку в профиле', 'warning');
            } else {
                showToast('Ошибка', response.error || 'Не удалось вывести предмет', 'error');
            }
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
                <div class="item-price">
                    <i class="fas fa-coins"></i> ${item.price || 0}
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
    if (tradeLinkInput && appState.tradeLink) tradeLinkInput.value = appState.tradeLink;
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
    } else {
        // Для демо всегда доступно
        timerElement.textContent = 'Доступно сейчас!';
        bonusBtn.disabled = false;
    }
}

// ===== АНИМАЦИИ =====
function showCaseOpening() {
    const openingElement = document.getElementById('case-opening');
    const openingText = document.getElementById('opening-text');
    
    if (openingElement && openingText) {
        openingElement.classList.remove('hidden');
        openingText.textContent = 'Открываем кейс...';
    }
}

function showWonItem(itemName, itemPrice) {
    const wonItemElement = document.getElementById('won-item');
    const openingText = document.getElementById('opening-text');
    
    if (wonItemElement && openingText) {
        openingText.textContent = 'Поздравляем!';
        wonItemElement.innerHTML = `
            <i class="fas fa-gift"></i>
            <h3>${itemName}</h3>
            <p>Цена: ${itemPrice} баллов</p>
        `;
    }
}

function closeCaseOpening() {
    const openingElement = document.getElementById('case-opening');
    if (openingElement) {
        openingElement.classList.add('hidden');
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
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(link)
            .then(() => showToast('Скопировано!', 'Реферальная ссылка скопирована', 'success'))
            .catch(() => showToast('Ошибка', 'Не удалось скопировать', 'error'));
    } else {
        // Fallback для старых браузеров
        const textArea = document.createElement('textarea');
        textArea.value = link;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('Скопировано!', 'Реферальная ссылка скопирована', 'success');
    }
}

function closeApp() {
    if (tg && tg.close) {
        tg.close();
    } else {
        showToast('Внимание', 'Приложение можно закрыть через Telegram', 'info');
    }
}

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ HTML =====
// Делаем функции доступными глобально для onclick атрибутов
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

console.log("📦 CS2 Skin Bot скрипт загружен!");
