// Telegram Web App объект
const tg = window.Telegram.WebApp;
let userData = {};
let currentSection = 'main';

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    // Инициализируем Telegram Web App
    tg.ready();

    // Получаем данные пользователя
    const initData = tg.initDataUnsafe;

    if (initData.user) {
        userData = {
            id: initData.user.id,
            firstName: initData.user.first_name,
            lastName: initData.user.last_name || '',
            username: initData.user.username || '',
            photoUrl: initData.user.photo_url || null
        };

        updateUserInfo();
    }

    // Раскрываем на весь экран
    tg.expand();

    // Настройка темы
    setupTheme();

    // Загружаем данные с вашего сервера
    loadUserData();

    // Инициализируем кейсы
    initializeCases();

    // Инициализируем инвентарь
    initializeInventory();
});

// Настройка темы
function setupTheme() {
    if (tg.colorScheme === 'dark') {
        document.body.classList.add('dark-theme');
    }

    // Можно также установить цвета из Telegram
    tg.setHeaderColor('#667eea');
    tg.setBackgroundColor('#ffffff');
}

// Загрузка данных пользователя с вашего сервера
async function loadUserData() {
    try {
        // Здесь нужно сделать запрос к вашему бэкенду
        // Пример:
        // const response = await fetch(`https://ваш-сервер.ком/api/user/${userData.id}`);
        // const data = await response.json();

        // Временно используем тестовые данные
        userData.points = 1500;
        userData.inventory = [
            { name: "Наклейка | ENCE", price: 500 },
            { name: "FAMAS | Колония", price: 3000 },
            { name: "Five-SeveN | Хладагент", price: 5000 }
        ];
        userData.dailyBonusAvailable = true;

        updateUI();
    } catch (error) {
        showNotification('Ошибка загрузки данных', 'error');
        console.error('Error loading user data:', error);
    }
}

// Обновление информации о пользователе
function updateUserInfo() {
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');
    const balance = document.getElementById('balance');
    const userPoints = document.getElementById('user-points');

    if (userData.firstName) {
        userName.textContent = `${userData.firstName} ${userData.lastName}`;
    }

    if (userData.photoUrl) {
        userAvatar.innerHTML = `<img src="${userData.photoUrl}" alt="Avatar">`;
    }

    if (userData.points !== undefined) {
        balance.textContent = userData.points;
        userPoints.textContent = `${userData.points} баллов`;
    }
}

// Обновление всего UI
function updateUI() {
    updateUserInfo();
    updateInventory();
}

// Открытие секций
function openSection(sectionId) {
    // Скрываем все секции
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
    });

    // Показываем выбранную секцию
    const section = document.getElementById(`${sectionId}-section`);
    if (section) {
        section.classList.remove('hidden');
        currentSection = sectionId;
    } else {
        // Если секции нет, показываем главную
        openSection('main');
    }

    // Закрываем меню
    toggleMenu(false);
}

// Боковое меню
function toggleMenu(show) {
    const menu = document.getElementById('side-menu');
    if (show !== undefined) {
        menu.classList.toggle('active', show);
    } else {
        menu.classList.toggle('active');
    }
}

// Инициализация кейсов
function initializeCases() {
    const casesGrid = document.querySelector('.cases-grid');

    const cases = [
        { name: 'Базовый', price: 500, color: '#FF9800' },
        { name: 'Продвинутый', price: 3000, color: '#2196F3' },
        { name: 'Премиум', price: 5000, color: '#9C27B0' },
        { name: 'Элитный', price: 10000, color: '#4CAF50' },
        { name: 'Легендарный', price: 15000, color: '#FF5722' }
    ];

    casesGrid.innerHTML = cases.map(caseItem => `
        <div class="case-item"
             onclick="openCase(${caseItem.price})"
             style="background: linear-gradient(135deg, ${caseItem.color} 0%, ${adjustColor(caseItem.color, -20)} 100%)">
            <h3>${caseItem.name}</h3>
            <p class="price">${caseItem.price} баллов</p>
        </div>
    `).join('');
}

// Открытие кейса
async function openCase(price) {
    if (userData.points < price) {
        showNotification('Недостаточно баллов!', 'error');
        return;
    }

    // Показываем анимацию
    showNotification('Открываем кейс...');

    try {
        // Отправляем запрос на сервер
        const response = await fetch('/api/open_case', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userData.id,
                casePrice: price
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification(`Вы выиграли: ${result.itemName}!`);
            userData.points = result.newBalance;
            updateUI();

            // Обновляем инвентарь
            if (result.newItem) {
                userData.inventory.push(result.newItem);
                updateInventory();
            }
        } else {
            showNotification(result.error || 'Ошибка открытия кейса', 'error');
        }
    } catch (error) {
        showNotification('Ошибка соединения', 'error');
        console.error('Error opening case:', error);
    }
}

// Инициализация инвентаря
function initializeInventory() {
    updateInventory();
}

// Обновление инвентаря
function updateInventory() {
    const inventoryList = document.querySelector('.inventory-list');

    if (!userData.inventory || userData.inventory.length === 0) {
        inventoryList.innerHTML = '<p class="empty">Инвентарь пуст</p>';
        return;
    }

    inventoryList.innerHTML = userData.inventory.map((item, index) => `
        <div class="inventory-item">
            <div class="name">${item.name}</div>
            <div class="price">${item.price} баллов</div>
            <button class="btn-small" onclick="withdrawItem(${index})">Вывести</button>
        </div>
    `).join('');
}

// Ежедневный бонус
async function claimDailyBonus() {
    try {
        const response = await fetch('/api/daily_bonus', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userData.id
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification(`Получено ${result.bonus} баллов!`);
            userData.points += result.bonus;
            updateUI();
        } else {
            showNotification(result.error || 'Бонус уже получен', 'error');
        }
    } catch (error) {
        showNotification('Ошибка соединения', 'error');
        console.error('Error claiming bonus:', error);
    }
}

// Вывод предмета
async function withdrawItem(index) {
    const item = userData.inventory[index];

    if (!item) {
        showNotification('Предмет не найден', 'error');
        return;
    }

    if (!confirm(`Вывести "${item.name}"?`)) {
        return;
    }

    try {
        const response = await fetch('/api/withdraw', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userData.id,
                itemIndex: index,
                itemName: item.name
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotification('Запрос на вывод отправлен!');
            // Удаляем предмет из локального инвентаря
            userData.inventory.splice(index, 1);
            updateInventory();
        } else {
            showNotification(result.error || 'Ошибка вывода', 'error');
        }
    } catch (error) {
        showNotification('Ошибка соединения', 'error');
        console.error('Error withdrawing item:', error);
    }
}

// Копирование реферальной ссылки
function copyReferralLink() {
    const link = `https://t.me/your_bot_username?start=ref_${userData.id}`;

    // Используем Clipboard API
    navigator.clipboard.writeText(link)
        .then(() => {
            showNotification('Ссылка скопирована!');
        })
        .catch(err => {
            console.error('Error copying:', err);
            // Fallback для старых браузеров
            const textArea = document.createElement('textarea');
            textArea.value = link;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showNotification('Ссылка скопирована!');
        });
}

// Отправка данных обратно в бота
function sendDataToBot(action, data = {}) {
    tg.sendData(JSON.stringify({
        action: action,
        userId: userData.id,
        timestamp: Date.now(),
        ...data
    }));

    // Можно закрыть Mini App после отправки
    // tg.close();
}

// Уведомления
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Вспомогательные функции
function adjustColor(color, amount) {
    // Простая функция для изменения яркости цвета
    return '#' + color.replace(/^#/, '').replace(/../g, color =>
        ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2)
    );
}

// Обновление темы при изменении
tg.onEvent('themeChanged', setupTheme);
tg.onEvent('viewportChanged', function() {
    tg.expand(); // Всегда раскрываем на весь экран
});