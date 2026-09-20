import test from "node:test";
import assert from "node:assert/strict";
import { registerServiceWorker } from "./pwa.js";

/** 서비스 워커 한 개(설치 중인 버전). 상태를 바꾸면 statechange 가 울린다. */
function fakeWorker() {
  const handlers = new Set();
  return {
    state: "installing",
    addEventListener: (type, fn) => { if (type === "statechange") handlers.add(fn); },
    become(state) { this.state = state; handlers.forEach((fn) => fn()); },
  };
}

function fakeContainer({ controller = null, waiting = null, fail = false } = {}) {
  const registration = {
    waiting,
    installing: null,
    handlers: new Map(),
    addEventListener(type, fn) { this.handlers.set(type, fn); },
    fireUpdateFound(worker) { this.installing = worker; this.handlers.get("updatefound")?.(); },
  };
  return {
    controller,
    registration,
    registered: [],
    register(url) {
      this.registered.push(url);
      return fail ? Promise.reject(new Error("등록 실패")) : Promise.resolve(registration);
    },
  };
}

test("개발 중에는 등록하지 않는다(고친 코드가 캐시에 갇힌다)", async () => {
  const container = fakeContainer();
  const result = await registerServiceWorker({ container, isProduction: false });

  assert.equal(result, null);
  assert.deepEqual(container.registered, []);
});

test("서비스 워커를 지원하지 않는 브라우저에서는 조용히 넘어간다", async () => {
  assert.equal(await registerServiceWorker({ container: undefined, isProduction: true }), null);
  assert.equal(await registerServiceWorker({ container: {}, isProduction: true }), null);
});

test("배포 화면에서는 /sw.js 를 등록한다", async () => {
  const container = fakeContainer();
  const registration = await registerServiceWorker({ container, isProduction: true });

  assert.deepEqual(container.registered, ["/sw.js"]);
  assert.equal(registration, container.registration);
});

test("등록이 실패해도 앱을 멈추지 않는다", async () => {
  const container = fakeContainer({ fail: true });
  assert.equal(await registerServiceWorker({ container, isProduction: true }), null);
});

test("새 버전이 설치를 마치면 알린다", async () => {
  const container = fakeContainer({ controller: {} });
  let notified = 0;
  await registerServiceWorker({ container, isProduction: true, onUpdate: () => { notified += 1; } });

  const worker = fakeWorker();
  container.registration.fireUpdateFound(worker);
  assert.equal(notified, 0);          // 아직 설치 중이다

  worker.become("installed");
  assert.equal(notified, 1);
});

test("첫 설치는 새 버전이 아니므로 알리지 않는다", async () => {
  const container = fakeContainer({ controller: null }); // 아직 아무 버전도 화면을 맡고 있지 않다
  let notified = 0;
  await registerServiceWorker({ container, isProduction: true, onUpdate: () => { notified += 1; } });

  const worker = fakeWorker();
  container.registration.fireUpdateFound(worker);
  worker.become("installed");
  assert.equal(notified, 0);
});

test("다른 탭이 이미 받아 둔 새 버전도 알린다", async () => {
  const container = fakeContainer({ controller: {}, waiting: {} });
  let notified = 0;
  await registerServiceWorker({ container, isProduction: true, onUpdate: () => { notified += 1; } });

  assert.equal(notified, 1);
});
