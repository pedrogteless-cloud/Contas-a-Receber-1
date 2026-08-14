// Service worker mínimo — só o necessário para o navegador considerar o app
// instalável. Sem cache agressivo: cada rota continua buscando dado fresco
// da rede (o sistema depende de dados sempre atualizados do Supabase).
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
