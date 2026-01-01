// service-worker.js
const CACHE_NAME = 'cs2-bot-v1';
const urlsToCache = [
    '/',
    '/style.css',
    '/script.js',
    '/manifest.json',
    'https://telegram.org/js/telegram-web-app.js?1',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', event => {
    console.log('🛠️ Service Worker: Установка...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Кеширование ресурсов...');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('✅ Все ресурсы закешированы');
                return self.skipWaiting();
            })
    );
});

self.addEventListener('activate', event => {
    console.log('🚀 Service Worker: Активация...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log(`🗑️ Удаление старого кеша: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('✅ Service Worker активирован');
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', event => {
    // Пропускаем запросы к API
    if (event.request.url.includes('/api/')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    console.log(`📁 Найдено в кеше: ${event.request.url}`);
                    return response;
                }
                
                console.log(`🌐 Загрузка из сети: ${event.request.url}`);
                return fetch(event.request)
                    .then(response => {
                        // Кешируем только успешные ответы и не кешируем API запросы
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                                console.log(`💾 Закешировано: ${event.request.url}`);
                            });
                        
                        return response;
                    })
                    .catch(error => {
                        console.error('❌ Ошибка загрузки:', error);
                        
                        // Для HTML страниц показываем fallback
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('/')
                                .then(response => response || new Response('Офлайн режим'));
                        }
                        
                        // Для других ресурсов возвращаем пустой ответ
                        return new Response('Ресурс недоступен в офлайн режиме', {
                            status: 503,
                            statusText: 'Service Unavailable',
                            headers: new Headers({
                                'Content-Type': 'text/plain'
                            })
                        });
                    });
            })
    );
});

// Обработка сообщений от клиента
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Периодическая синхронизация (если поддерживается)
if ('periodicSync' in self.registration) {
    self.addEventListener('periodicsync', event => {
        if (event.tag === 'update-cache') {
            event.waitUntil(updateCache());
        }
    });
}

async function updateCache() {
    console.log('🔄 Обновление кеша...');
    const cache = await caches.open(CACHE_NAME);
    
    for (const url of urlsToCache) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                await cache.put(url, response);
                console.log(`✅ Обновлен: ${url}`);
            }
        } catch (error) {
            console.error(`❌ Ошибка обновления ${url}:`, error);
        }
    }
}

// Обработка push-уведомлений
self.addEventListener('push', event => {
    console.log('🔔 Получено push-уведомление');
    
    const options = {
        body: event.data ? event.data.text() : 'Новое уведомление',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [200, 100, 200],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: '2'
        }
    };
    
    event.waitUntil(
        self.registration.showNotification('CS2 Skin Bot', options)
    );
});

self.addEventListener('notificationclick', event => {
    console.log('🖱️ Нажатие на уведомление');
    
    event.notification.close();
    
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
});

// Обработка офлайн/онлайн событий
self.addEventListener('online', () => {
    console.log('🌐 Приложение онлайн');
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'NETWORK_STATUS',
                status: 'online'
            });
        });
    });
});

self.addEventListener('offline', () => {
    console.log('📴 Приложение офлайн');
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'NETWORK_STATUS',
                status: 'offline'
            });
        });
    });
});

console.log('👷 Service Worker загружен');
