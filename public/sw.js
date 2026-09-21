/**
 * 골목마켓 서비스 워커.
 *
 * 직접 쓴다(vite-plugin-pwa 를 쓰지 않는다). 이 앱에서 캐시할 것은 네 가지뿐이고,
 * 무엇을 왜 캐시했는지 설명할 수 있어야 하기 때문이다.
 *
 *   /api/*           캐시하지 않는다. 로그인한 사람에 따라 내용이 다르다.
 *                    내 채팅·찜·알림이 다음 사람 화면에 보이면 안 된다.
 *   /api/images/*    캐시 우선. 업로드한 파일은 주소가 고유해서 내용이 바뀌지 않는다.
 *                    (사진을 바꾸면 새 주소가 된다.) 개수를 제한해 저장소를 무한정 쓰지 않는다.
 *   /assets/*        캐시 우선. 빌드가 파일 이름에 해시를 넣으므로 내용이 바뀌면 주소가 바뀐다.
 *   화면 이동          네트워크 우선. 성공하면 셸을 보관해 두고, 실패하면 그 셸로 앱을 연다.
 *
 * 새 버전을 밀어 넣지 않는다(skipWaiting 없음). 보고 있는 화면의 코드를 도중에 갈아치우면
 * 화면과 코드가 어긋날 수 있다. 화면 이동이 네트워크 우선이라 새로고침하면 어차피 최신 코드가 온다.
 * 새 버전이 준비되면 앱이 토스트로 알린다(src/pwa.js).
 */
const VERSION = "v1";
const SHELL = `golmok-shell-${VERSION}`;
const ASSETS = `golmok-assets-${VERSION}`;
const IMAGES = `golmok-images-${VERSION}`;
const KEEP = [SHELL, ASSETS, IMAGES];
const IMAGE_LIMIT = 120;

const OFFLINE = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>연결 끊김 · 골목마켓</title>
<style>body{margin:0;display:grid;place-items:center;height:100dvh;font-family:system-ui,sans-serif;background:#faf8f6;color:#3b342b;text-align:center;padding:24px}
h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#6b6156;font-size:15px;line-height:1.6}</style>
</head><body><div><h1>연결이 끊겼어요</h1><p>인터넷에 연결한 뒤 다시 열어 주세요.</p></div></body></html>`;

/** 캐시에 넣어도 되는 응답인지. 오류·리다이렉트·다른 출처(opaque) 응답은 넣지 않는다. */
const storable = (response) => response && response.status === 200 && response.type === "basic";

self.addEventListener("install", (event) => {
  // 오프라인에서도 앱이 열리도록 셸을 미리 받아 둔다.
  // cache: "reload" — 브라우저 캐시에 남은 낡은 셸을 쓰지 않는다.
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.add(new Request("/", { cache: "reload" })))
      .catch(() => { /* 오프라인 설치는 실패해도 된다. 다음 방문 때 다시 담긴다. */ })
  );
});

self.addEventListener("activate", (event) => {
  // 버전이 올라가면 옛 캐시를 지운다. 우리 것(golmok-)만 건드린다.
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => name.startsWith("golmok-") && !KEEP.includes(name))
        .map((name) => caches.delete(name))
    );
  })());
  // clients.claim() 은 부르지 않는다. 이미 열려 있는 화면은 그 화면을 띄운 버전이 계속 맡는다.
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try { url = new URL(request.url); } catch { return; }
  // 다른 출처(글꼴 CDN 등)는 브라우저 캐시에 맡긴다.
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    if (url.pathname.startsWith("/api/images/")) event.respondWith(cacheFirst(request, IMAGES, IMAGE_LIMIT));
    return; // 그 외 API 는 손대지 않는다(캐시 금지).
  }
  if (request.mode === "navigate") { event.respondWith(networkFirstShell(request)); return; }
  if (url.pathname.startsWith("/assets/")) event.respondWith(cacheFirst(request, ASSETS));
});

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (storable(response)) {
    await cache.put(request, response.clone());
    if (limit) await trim(cache, limit);
  }
  return response;
}

/** 오래 전에 담은 것부터 지운다(cache.keys() 는 넣은 순서로 온다). */
async function trim(cache, limit) {
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

async function networkFirstShell(request) {
  try {
    const response = await fetch(request);
    // 어느 주소로 들어오든 서버는 같은 셸(index.html)을 준다. 그래서 "/" 한 자리에만 보관한다.
    if (storable(response)) {
      const cache = await caches.open(SHELL);
      await cache.put("/", response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match("/", { cacheName: SHELL });
    return cached ?? new Response(OFFLINE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

/* ---------- 웹 푸시 ---------- */

/**
 * 서버(PushService)가 보낸 알림을 띄운다. 본문은 {title, body, url, tag}.
 *
 * 받은 푸시는 반드시 알림으로 보여야 한다. iOS 와 Chrome 은 보여 주지 않으면 구독을 끊거나
 * "백그라운드에서 업데이트됨" 같은 기본 알림을 대신 띄운다. 앱을 보고 있는 사람에게는
 * 서버가 애초에 보내지 않는다(PushRelay 가 WebSocket 연결 여부로 거른다).
 *
 * 같은 tag(같은 채팅방)는 알림 하나로 겹친다. renotify 로 새 메시지가 오면 다시 울린다.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: safePath(data.url) },
  };
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(data.title || "골목마켓", options));
});

/** 알림을 누르면 앱을 앞으로 가져와 그 화면으로 보낸다. 열린 창이 없으면 새로 연다. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      try {
        await client.navigate(target);
      } catch {
        // 이 워커가 맡지 않은 창은 옮길 수 없다. 새 창으로 연다.
        await self.clients.openWindow(target);
      }
      return;
    }
    await self.clients.openWindow(target);
  })());
});

/**
 * 우리 앱 안의 경로만 연다. "//evil.com" 이나 "https://…" 가 들어와도 밖으로 나가지 않는다
 * (서버가 만든 값이지만, 알림 경로 허용 목록 routes.isAppPath 와 같은 이유로 한 번 더 막는다).
 */
function safePath(url) {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}
