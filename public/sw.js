const CACHE_NAME = 'poke-card-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icon-512.png'
];

// Instalar Service Worker y almacenar en cache la shell de la app
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activar y limpiar caches antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Borrando cache antigua:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptar Peticiones
self.addEventListener('fetch', (event) => {
  // Solo interceptar peticiones GET locales
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Omitir peticiones de API (como Supabase)
  if (event.request.url.includes('/rest/v1/') || event.request.url.includes('/auth/v1/')) {
    return;
  }

  // Si es una petición de navegación de página (text/html o ruta de SPA sin extensión de archivo)
  const url = new URL(event.request.url);
  const path = url.pathname;
  const isNavigation = event.request.mode === 'navigate' || 
                       (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) ||
                       (!path.split('/').pop().includes('.'));

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Si falla la red, servir el index.html desde la caché para resolver la SPA
          return caches.match('/index.html')
            .then((response) => {
              if (response) {
                return response;
              }
              // Si no está index.html, servir offline.html
              return caches.match('/offline.html');
            });
        })
    );
    return;
  }

  // Peticiones de recursos estáticos (CSS, JS, Imágenes, Sonidos)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Guardar recursos estáticos exitosos en la caché dinámica
        if (response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si no está en caché, lanzar una respuesta vacía o un error de red controlado en vez de undefined
          return new Response('Red no disponible', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        });
      })
  );
});
