// Telegram Web App SDK
const tg = window.Telegram.WebApp;

// Состояние приложения
let appState = {
    user: null,
    balance: 0,
    inventory: [],
    dailyBonusAvailable: true,
    lastBonusTime: null,
    usedPromoCodes: []
};

// Инициализация приложения
document.addEventListener('DOMContentLoaded', function() {
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
    
    // Обновляем стили для темы
    if (isDark) {
        document.documentElement.style.setProperty('--light-bg', '#1a202c');
        document.documentElement.style.setProperty('--light-card', '#2d3748');
        document.documentElement.style.setProperty('--text-dark', '#ffffff');
    } else {
        document.documentElement.style.setProperty('--light-bg', '#f7fafc');
        document.documentElement.style.setProperty('--light-card', '#ffffff');
        document.documentElement.style.setProperty('--text-dark', '#2d3748');
    }
}

// Загрузка данных пользователя
async function loadUserData() {
    try {
        showLoading();
        
        // Здесь должен быть запрос к вашему API
        // const response = await fetch('https://ваш-сервер.com/api/user-data', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ 
        //         user_id: appState.user?.id,
        //         init_data: tg.initData 
        //     })
        // });
        
        // Временно используем тестовые данные
        const testData = {
            success: true,
            balance: 1500,
            inventory: [
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
                },
                { 
                    id: 4, 
                    name: "Наклейка | Grayhound", 
                    price: 500, 
                    type: "sticker",
                    image: "https://via.placeholder.com/64"
                },
                { 
                    id: 5, 
                    name: "Брелок | Щепотка соли", 
                    price: 15000, 
                    type: "other",
                    image: "https://via.placeholder.com/64"
                }
            ],
            dailyBonusAvailable: true,
            lastBonusTime: Date.now() - 12 * 60 * 60 * 1000, // 12 часов назад
            usedPromoCodes: ["MINI1"]
        };
        
        // Обновляем состояние
        appState.balance = testData.balance;
        appState.inventory = testData.inventory;
        appState.dailyBonusAvailable = testData.dailyBonusAvailable;
        appState.lastBonusTime = testData.lastBonusTime;
        appState.usedPromoCodes = testData.usedPromoCodes;
        
        // Обновляем UI
        updateUI();
        
        hideLoading();
        
    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Ошибка загрузки данных', 'Попробуйте позже', 'error');
    }
}

// Обновление информации о пользователе
function updateUserInfo() {
    if (!appState.user) return;
    
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');
    const menuUsername = document.getElementById('menu-username');
    const menuAvatar = document.getElementById('menu-avatar');
    
    // Обновляем имя
    const displayName = appState.user.firstName + (appState.user.lastName ? ' ' + appState.user.lastName : '');
    userName.textContent = displayName;
    if (menuUsername) menuUsername.textContent = displayName;
    
    // Обновляем аватар
    if (appState.user.photoUrl) {
        userAvatar.innerHTML = `<img src="${appState.user.photoUrl}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        if (menuAvatar) menuAvatar.innerHTML = `<img src="${appState.user.photoUrl}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
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
        // Имитируем задержку открытия
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Здесь должен быть запрос к вашему API
        // const response = await fetch('https://ваш-сервер.com/api/open-case', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         user_id: appState.user?.id,
        //         case_price: price
        //     })
        // });
        
        // Тестовый результат
        const testItems = [
            "Наклейка | ENCE",
            "Наклейка | Grayhound",
            "Наклейка | PGL |",
            "Наклейка | huNter |",
            "FAMAS | Колония",
            "UMP-45 | Внедорожник",
            "Five-SeveN | Хладагент",
            "Капсула с наклейками",
            "Наклейка | XD"
        ];
        
        const wonItemName = testItems[Math.floor(Math.random() * testItems.length)];
        const itemPrice = Math.floor(price * 0.7); // 70% от стоимости кейса
        
        // Обновляем состояние
        appState.balance -= price;
        appState.inventory.push({
            id: Date.now(),
            name: wonItemName,
            price: itemPrice,
            type: wonItemName.includes('Наклейка') ? 'sticker' : 
                  wonItemName.includes('FAMAS') || wonItemName.includes('UMP') || wonItemName.includes('Five-SeveN') ? 'weapon' : 'other',
            image: "https://via.placeholder.com/64"
        });
        
        // Показываем выигрыш
        openingText.textContent = 'Поздравляем!';
        wonItem.innerHTML = `
            <i class="fas fa-trophy"></i>
            <div>${wonItemName}</div>
            <small>+${itemPrice.toLocaleString()} баллов</small>
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
        
    } catch (error) {
        console.error('Error opening case:', error);
        openingText.textContent = 'Ошибка открытия';
        wonItem.innerHTML = '<i class="fas fa-exclamation-triangle"></i><div>Попробуйте еще раз</div>';
        showToast('Ошибка', 'Не удалось открыть кейс', 'error');
    }
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
        // Здесь должен быть запрос к вашему API
        // const response = await fetch('https://ваш-сервер.com/api/daily-bonus', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ user_id: appState.user?.id })
        // });
        
        // Тестовый результат
        const bonusAmount = 50;
        
        // Обновляем состояние
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
        
    } catch (error) {
        console.error('Error claiming bonus:', error);
        showToast('Ошибка', 'Не удалось получить бонус', 'error');
    }
}

// Вывод предмета
async function withdrawItem(itemId) {
    const item = appState.inventory.find(i => i.id === itemId);
    if (!item) return;
    
    if (!confirm(`Вывести предмет "${item.name}"?`)) {
        return;
    }
    
    try {
        showLoading();
        
        // Здесь должен быть запрос к вашему API
        // const response = await fetch('https://ваш-сервер.com/api/withdraw', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         user_id: appState.user?.id,
        //         item_id: itemId
        //     })
        // });
        
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
        
    } catch (error) {
        console.error('Error withdrawing item:', error);
        showToast('Ошибка', 'Не удалось отправить запрос', 'error');
    } finally {
        hideLoading();
    }
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
        
        // Здесь должен быть запрос к вашему API
        // const response = await fetch('https://ваш-сервер.com/api/withdraw-all', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         user_id: appState.user?.id,
        //         items: appState.inventory
        //     })
        // });
        
        // Сохраняем копию инвентаря для отправки
        const inventoryCopy = [...appState.inventory];
        
        // Очищаем инвентарь
        appState.inventory = [];
        
        // Обновляем UI
        updateUI();
        
        // Отправляем данные в бота
        sendToBot('all_items_withdrawn', {
            items_count: inventoryCopy.length,
            total_value: totalValue,
            items: inventoryCopy.map(item => item.name)
        });
        
        showToast('Запрос отправлен', `Вывод ${inventoryCopy.length} предметов`, 'success');
        
    } catch (error) {
        console.error('Error withdrawing all items:', error);
        showToast('Ошибка', 'Не удалось отправить запрос', 'error');
    } finally {
        hideLoading();
    }
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
    
    try {
        showLoading();
        
        // Здесь должен быть запрос к вашему API
        // const response = await fetch('https://ваш-сервер.com/api/activate-promo', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         user_id: appState.user?.id,
        //         promo_code: code
        //     })
        // });
        
        const points = testPromos[code];
        
        // Обновляем состояние
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
        
    } catch (error) {
        console.error('Error activating promo:', error);
        showToast('Ошибка', 'Не удалось активировать промокод', 'error');
    } finally {
        hideLoading();
    }
}

// Копирование реферальной ссылки
function copyReferralLink() {
    if (!appState.user) return;
    
    const botUsername = 'MeteoHinfoBot'; // Замените на username вашего бота
    const referralLink = `https://t.me/${botUsername}?start=ref_${appState.user.id}`;
    
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
            container.removeChild(toast);
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
        if (menu.classList.contains('active') && !e.target.closest('.menu-content') && !e.target.closest('.menu-btn')) {
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
