const CACHE_NAME = 'retool-v2';
const RUNTIME_CACHE = 'retool-runtime-v2';

// 需要缓存的核心资源
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/404.html',
  '/manifest.json'
];

// 安装事件：预缓存核心资源
self.addEventListener('install', (event) => {
  console.log('[Service Worker] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] 预缓存核心资源');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// 激活事件：清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] 激活中...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[Service Worker] 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch事件：网络优先，缓存回退策略
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳过非GET请求
  if (request.method !== 'GET') {
    return;
  }

  // 跳过chrome扩展和其他协议
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 跳过跨域请求（如Google Analytics）
  if (url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // 网络优先策略：尝试从网络获取最新资源
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            // 只缓存成功的响应
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // 网络失败时返回缓存
            if (cachedResponse) {
              console.log('[Service Worker] 使用缓存:', request.url);
              return cachedResponse;
            }
            // 如果是HTML请求且缓存中没有，返回离线页面
            if (request.headers.get('accept').includes('text/html')) {
              return caches.match('/index.html');
            }
          });

        // 如果有缓存，立即返回缓存，同时在后台更新
        return cachedResponse || fetchPromise;
      })
  );
});

// 消息事件：处理来自客户端的消息
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }).then(() => {
        return self.clients.matchAll();
      }).then((clients) => {
        clients.forEach(client => client.postMessage({
          type: 'CACHE_CLEARED'
        }));
      })
    );
  }
});

