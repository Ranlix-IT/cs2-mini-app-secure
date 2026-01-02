// service-worker.js
const CACHE_NAME = 'cs2-bot-v2.0.1';
const urlsToCache = [
    '/',
    '/style.css',
    '/script.js',
    '/manifest.json',
    'https://telegram.org/js/telegram-web-app.js?1',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Флаг для принудительного обновления
const FORCE_UPDATE = true;

self.addEventListener('install', event => {
    console.log('🛠️ Service Worker: Установка новой версии...');
    
    if (FORCE_UPDATE) {
        // Удаляем старый кеш и устанавливаем новый
        event.waitUntil(
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        console.log(`🗑️ Удаление старого кеша: ${cacheName}`);
                        return caches.delete(cacheName);
                    })
                );
            }).then(() => {
                return caches.open(CACHE_NAME)
                    .then(cache => {
                        console.log('📦 Кеширование новых ресурсов...');
                        return cache.addAll(urlsToCache);
                    });
            })
        );
    } else {
        // Обычная установка
        event.waitUntil(
            caches.open(CACHE_NAME)
                .then(cache => {
                    console.log('📦 Кеширование ресурсов...');
                    return cache.addAll(urlsToCache);
                })
                .then(() => {
                    console.log('✅ Ресурсы закешированы');
                    return self.skipWaiting();
                })
        );
    }
});

self.addEventListener('activate', event => {
    console.log('🚀 Service Worker: Активация...');
    
    event.waitUntil(
        Promise.all([
            // Очистка старых кешей
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            console.log(`🗑️ Удаление старого кеша: ${cacheName}`);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            
            // Уведомление клиентов о новой версии
            self.clients.claim()
        ]).then(() => {
            console.log('✅ Service Worker активирован');
            
            // Уведомляем все вкладки о новой версии
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'NEW_VERSION',
                        version: CACHE_NAME,
                        timestamp: Date.now()
                    });
                });
            });
        })
    );
});

self.addEventListener('fetch', event => {
    // Пропускаем запросы к API
    if (event.request.url.includes('/api/')) {
        return;
    }
    
    // Для статических файлов - стратегия "Cache First, затем Network"
    if (event.request.url.includes('/style.css') || 
        event.request.url.includes('/script.js') ||
        event.request.url.includes('/manifest.json')) {
        
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    if (response) {
                        // Обновляем кеш в фоне
                        fetchAndCache(event.request);
                        return response;
                    }
                    
                    return fetchAndCache(event.request);
                })
                .catch(() => {
                    return caches.match('/');
                })
        );
        return;
    }
    
    // Для остальных - Network First
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Кешируем успешные ответы
                if (response.ok) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request)
                    .then(response => response || caches.match('/'));
            })
    );
});

// Функция для получения и кеширования
async function fetchAndCache(request) {
    try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw error;
    }
}

// Периодическая проверка обновлений (если поддерживается)
if ('periodicSync' in self.registration) {
    self.addEventListener('periodicsync', event => {
        if (event.tag === 'update-cache') {
            event.waitUntil(updateCache());
        }
    });
}

// Функция обновления кеша
async function updateCache() {
    console.log('🔄 Фоновая проверка обновлений...');
    const cache = await caches.open(CACHE_NAME);
    
    for (const url of urlsToCache) {
        try {
            const response = await fetch(url, {
                cache: 'no-cache',
                headers: { 'Cache-Control': 'no-cache' }
            });
            
            if (response.ok) {
                await cache.put(url, response);
                console.log(`✅ Фоновое обновление: ${url}`);
            }
        } catch (error) {
            console.error(`❌ Ошибка обновления ${url}:`, error);
        }
    }
}

// Обработка сообщений от клиента
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'UPDATE_CACHE') {
        updateCache();
    }
});

// Push уведомления
self.addEventListener('push', event => {
    console.log('🔔 Push уведомление получено');
    
    const options = {
        body: event.data ? event.data.text() : 'Новое уведомление от CS2 Bot',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [200, 100, 200],
        data: { url: '/' },
        actions: [
            { action: 'open', title: 'Открыть' },
            { action: 'close', title: 'Закрыть' }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('CS2 Skin Bot', options)
    );
});

self.addEventListener('notificationclick', event => {
    console.log('🖱️ Клик по уведомлению');
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then(clientList => {
                    for (const client of clientList) {
                        if (client.url === '/' && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    if (clients.openWindow) {
                        return clients.openWindow('/');
                    }
                })
        );
    }
});

// Синхронизация в фоне
self.addEventListener('sync', event => {
    if (event.tag === 'sync-data') {
        event.waitUntil(syncData());
    }
});

async function syncData() {
    console.log('🔄 Фоновая синхронизация данных');
    // Здесь можно синхронизировать данные с сервером
}

console.log('👷 Service Worker загружен и готов к работе');
