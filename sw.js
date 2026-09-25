// Only for notifications (Android requires them to go through a service worker).
// No fetch handler on purpose: nothing is cached, deploys apply immediately.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(self.registration.scope);
    })()
  );
});
