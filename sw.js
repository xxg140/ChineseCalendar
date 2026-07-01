/**
 * Service Worker for Chinese Lunar Calendar PWA
 * 日历 Service Worker
 */

const CACHE_NAME = 'chinese-calendar-v1.7.0';  // ← Change this when you update JS/CSS
const RUNTIME_CACHE = 'chinese-calendar-runtime';

// 动态获取基础路径（支持 GitHub Pages 子目录）
const getBasePath = () => {
    if (typeof self !== 'undefined' && self.location) {
        const path = self.location.pathname;
        // 如果在子目录中（如 GitHub Pages），提取基础路径
        const match = path.match(/^(\/[^\/]+)/);
        return match ? match[1] : '';
    }
    return '';
};

const BASE_PATH = getBasePath();

// 需要缓存的静态资源（使用相对路径）
// 安装阶段只缓存首屏必需资源，避免阻塞首次安装
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './favicon.svg',
    './css/styles.css',
    './js/app.js',
    './js/calendar.js',
    './js/lunar.js',
    './js/holiday.js',
    './icons/icon-192x192.svg',
    './icons/icon-512x512.svg'
];

// Service Worker 安装事件
self.addEventListener('install', (event) => {
    console.log('Service Worker 安装中...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('正在缓存应用资源...');
                // 直接缓存静态资源，不包含外部资源
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('所有资源已缓存');
                // 立即激活新的 Service Worker
                self.skipWaiting();
            })
            .catch((error) => {
                console.error('缓存资源失败:', error);
                // 即使缓存失败，也要跳过等待
                self.skipWaiting();
            })
    );
});

// Service Worker 激活事件
self.addEventListener('activate', (event) => {
    console.log('Service Worker 激活中...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // 删除旧版本缓存
                        if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
                            console.log('删除旧缓存:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker 已激活');
                // 立即控制所有页面
                return self.clients.claim();
            })
    );
});

// 网络请求拦截
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 只处理 HTTP(S) 请求
    if (!request.url.startsWith('http')) {
        return;
    }

    // 对于导航请求（页面请求），使用 stale-while-revalidate
    // 先秒开缓存，后台静默更新；离线/缓存未命中时回退首页
    if (request.mode === 'navigate') {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                const fetchPromise = fetch(request)
                    .then((response) => {
                        if (response && response.status === 200) {
                            const responseClone = response.clone();
                            caches.open(RUNTIME_CACHE).then((cache) => {
                                cache.put(request, responseClone);
                            });
                        }
                        return response;
                    })
                    .catch(() => null);
                // 有缓存立刻返回，没有就等网络
                return cachedResponse || fetchPromise || caches.match('./index.html') || caches.match('/index.html');
            })
        );
        return;
    }

    // 对于静态资源，使用缓存优先策略
    if (STATIC_ASSETS.some(asset => {
        // 将相对路径转换为绝对路径进行比较
        const assetUrl = new URL(asset, self.location.origin + BASE_PATH + '/').href;
        return request.url === assetUrl || url.pathname === asset.replace('./', '/') || url.pathname.startsWith('/icons/');
    })) {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    // 如果缓存中没有，从网络获取
                    return fetch(request)
                        .then((response) => {
                            // 只缓存成功的响应
                            if (response.status === 200) {
                                const responseClone = response.clone();
                                caches.open(CACHE_NAME)
                                    .then((cache) => {
                                        cache.put(request, responseClone);
                                    });
                            }
                            return response;
                        });
                })
        );
        return;
    }

    // 对于其他请求，使用网络优先，缓存后备策略
    event.respondWith(
        fetch(request)
            .then((response) => {
                // 缓存成功的响应
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(RUNTIME_CACHE)
                        .then((cache) => {
                            cache.put(request, responseClone);
                        });
                }
                return response;
            })
            .catch(() => {
                // 网络失败时从缓存返回
                return caches.match(request);
            })
    );
});

// 错误处理
self.addEventListener('error', (event) => {
    console.error('Service Worker 错误:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Service Worker 未处理的 Promise 拒绝:', event.reason);
});

console.log('Service Worker 已加载');