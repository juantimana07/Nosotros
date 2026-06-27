// nosotros · Service Worker
const CACHE_NAME = 'nosotros-v1';
const ASSETS = ['/', '/index.html'];

// ── Install: cache app shell ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fall back to network ──
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('/index.html')))
  );
});

// ── Receive tasks from main app ──
let storedTasks = [];
let storedNameJuan = 'Juan';
let storedNameCata = 'Cata';

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SYNC_TASKS') {
    try {
      storedTasks = JSON.parse(e.data.tasks || '[]');
      storedNameJuan = e.data.nameJuan || 'Juan';
      storedNameCata = e.data.nameCata || 'Cata';
    } catch(err) {}
  }
});

// ── Daily deadline check via periodic sync (where supported) ──
self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-deadlines') {
    e.waitUntil(checkAndNotify());
  }
});

// ── Push notification handler ──
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'nosotros', {
      body: data.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: data.tag || 'nosotros',
      requireInteraction: data.urgent || false,
    })
  );
});

// ── Notification click: open app ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

function displayName(a) {
  if (a === 'juan') return storedNameJuan;
  if (a === 'cata') return storedNameCata;
  return 'J&C';
}

function parseLocalDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

async function checkAndNotify() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const urgent = [], soon = [];

  function walk(nodes) {
    (nodes || []).forEach(n => {
      if (!n.done && n.date) {
        const target = parseLocalDate(n.date);
        const diff = Math.round((target - today) / 86400000);
        if (diff === 0) urgent.push({ text: n.text, assignee: n.assignee, diff });
        else if (diff > 0 && diff <= 3) soon.push({ text: n.text, assignee: n.assignee, diff });
      }
      walk(n.subtasks);
    });
  }
  walk(storedTasks);

  const notifications = [];

  if (urgent.length) {
    notifications.push(self.registration.showNotification('🔴 Vence hoy', {
      body: urgent.map(t => `• ${t.text} (${displayName(t.assignee)})`).join('\n'),
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'urgente',
      requireInteraction: true,
      vibrate: [200, 100, 200],
    }));
  }

  if (soon.length) {
    notifications.push(self.registration.showNotification('🟡 Próximas a vencer', {
      body: soon.map(t => `• ${t.text} — ${t.diff}d (${displayName(t.assignee)})`).join('\n'),
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'pronto',
      vibrate: [100, 50, 100],
    }));
  }

  return Promise.all(notifications);
}
