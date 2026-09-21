import test from "node:test";
import assert from "node:assert/strict";
import { createApiClient } from "./client.js";

test("이미지 업로드는 FormData와 브라우저의 multipart 경계를 유지한다", async () => {
  const body = new FormData(); body.append("files", new Blob(["photo"], { type: "image/png" }), "photo.png");
  const client = createApiClient({ fetchImpl: async (_, options) => {
    assert.equal(options.headers["Content-Type"], undefined);
    assert.equal(options.body, body);
    assert.equal(await options.body.get("files").text(), "photo");
    return Response.json({ imageUrls: ["/api/images/photo.png"] });
  } });
  await client.request("/images", { method: "POST", body });
});

test("업로드 중 토큰 만료 시 파일 본문을 보존해 재시도한다", async () => {
  const body = new FormData(); body.append("files", new Blob(["photo"]), "photo.png");
  let attempts = 0;
  const client = createApiClient({ storage: storage(), fetchImpl: async (url, options) => {
    if (url.endsWith("/auth/reissue")) return Response.json(rotated);
    attempts++;
    assert.equal(options.body, body);
    assert.equal(options.headers["Content-Type"], undefined);
    return attempts === 1 ? expired() : Response.json({ imageUrls: ["/api/images/photo.png"] });
  } });
  await client.request("/images", { method: "POST", body });
  assert.equal(attempts, 2);
});

const original = { accessToken: "old-access", refreshToken: "old-refresh", user: { id: 1, nickname: "사용자" } };
const rotated = { accessToken: "new-access", refreshToken: "new-refresh" };
const expired = () => Response.json({ code: "EXPIRED_TOKEN", message: "만료" }, { status: 401 });
function storage(value = original) {
  let saved = JSON.stringify(value);
  return { getItem: () => saved, setItem: (_, value) => { saved = value; }, removeItem: () => { saved = null; } };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("동시 만료 요청은 재발급 한 번을 공유하고 새 토큰으로 재시도한다", async () => {
  let refreshCount = 0;
  const saved = storage();
  const client = createApiClient({ storage: saved, fetchImpl: async (url, options) => {
    if (url.endsWith("/auth/reissue")) { refreshCount++; return Response.json(rotated); }
    return options.headers.Authorization === "Bearer old-access" ? expired() : Response.json({ ok: true });
  } });
  const results = await Promise.all([client.request("/one"), client.request("/two"), client.request("/three")]);
  assert.equal(refreshCount, 1);
  assert.ok(results.every((item) => item.ok));
  assert.equal(JSON.parse(saved.getItem()).refreshToken, "new-refresh");
});

test("재발급이 끝난 뒤 도착한 이전 토큰의 401은 재발급을 반복하지 않는다", async () => {
  const late = deferred(); let refreshCount = 0;
  const client = createApiClient({ storage: storage(), fetchImpl: async (url, options) => {
    if (url.endsWith("/auth/reissue")) { refreshCount++; return Response.json(rotated); }
    if (options.headers.Authorization === "Bearer old-access") {
      if (url.endsWith("/slow")) await late.promise;
      return expired();
    }
    return Response.json({ ok: true });
  } });
  const slow = client.request("/slow");
  await client.request("/fast"); late.resolve();
  assert.deepEqual(await slow, { ok: true });
  assert.equal(refreshCount, 1);
});

test("한 화면의 취소가 공유 재발급과 다른 요청을 취소하지 않는다", async () => {
  const started = deferred(), release = deferred(), abort = new AbortController();
  const client = createApiClient({ storage: storage(), fetchImpl: async (url, options) => {
    if (url.endsWith("/auth/reissue")) { started.resolve(); await release.promise; return Response.json(rotated); }
    return options.headers.Authorization === "Bearer old-access" ? expired() : Response.json({ ok: true });
  } });
  const results = Promise.allSettled([client.request("/one", { signal: abort.signal }), client.request("/two")]);
  await started.promise; abort.abort(); release.resolve();
  const [one, two] = await results;
  assert.equal(one.reason.name, "AbortError"); assert.equal(two.status, "fulfilled");
});

test("위조 토큰이면 재발급 없이 세션을 지운다", async () => {
  let calls = 0;
  const client = createApiClient({ storage: storage(), fetchImpl: async () => {
    calls++; return Response.json({ code: "INVALID_TOKEN", message: "위조" }, { status: 401 });
  } });
  await assert.rejects(client.request("/products"), { code: "INVALID_TOKEN" });
  assert.equal(client.getSession(), null); assert.equal(calls, 1);
});

test("유효하지 않은 refresh token은 세션을 지운다", async () => {
  const client = createApiClient({ storage: storage(), fetchImpl: async (url) => url.endsWith("/auth/reissue")
    ? Response.json({ code: "INVALID_REFRESH_TOKEN" }, { status: 401 }) : expired() });
  await assert.rejects(client.request("/products"), { code: "INVALID_REFRESH_TOKEN" });
  assert.equal(client.getSession(), null);
});

test("재발급 서버 오류와 네트워크 오류는 저장된 세션을 보존한다", async () => {
  for (const networkFailure of [false, true]) {
    const client = createApiClient({ storage: storage(), fetchImpl: async (url) => {
      if (!url.endsWith("/auth/reissue")) return expired();
      if (networkFailure) throw new TypeError("offline");
      return Response.json({ code: "INTERNAL_ERROR", message: "서버 오류" }, { status: 500 });
    } });
    await assert.rejects(client.request("/products"));
    assert.equal(client.getSession().refreshToken, original.refreshToken);
  }
});

test("이전 세션의 늦은 재발급 결과는 새 로그인 상태를 덮어쓰지 않는다", async () => {
  const started = deferred(), release = deferred();
  const next = { ...rotated, user: { id: 2, nickname: "다른사용자" } };
  const client = createApiClient({ storage: storage(), fetchImpl: async (url) => {
    if (url.endsWith("/auth/login")) return Response.json(next);
    if (url.endsWith("/auth/reissue")) { started.resolve(); await release.promise; return Response.json(rotated); }
    return expired();
  } });
  const pending = assert.rejects(client.request("/products"), { code: "SESSION_CHANGED" });
  await started.promise; await client.login({ email: "other@example.com", password: "dummy" });
  release.resolve(); await pending;
  assert.equal(client.getSession().user.id, 2);
});

test("세션을 지운 뒤 늦은 재발급이 와도 로그인이 복구되지 않는다", async () => {
  const started = deferred(), release = deferred();
  const client = createApiClient({ storage: storage(), fetchImpl: async (url) => {
    if (url.endsWith("/auth/reissue")) { started.resolve(); await release.promise; return Response.json(rotated); }
    return expired();
  } });
  const pending = assert.rejects(client.request("/products"), { code: "SESSION_CHANGED" });
  await started.promise; client.clearSession(); release.resolve(); await pending;
  assert.equal(client.getSession(), null);
});

test("로그아웃 중 access token이 만료되면 회전된 refresh token을 폐기한다", async () => {
  const bodies = [];
  const client = createApiClient({ storage: storage(), fetchImpl: async (url, options) => {
    if (url.endsWith("/auth/reissue")) return Response.json(rotated);
    bodies.push(JSON.parse(options.body));
    return options.headers.Authorization === "Bearer old-access" ? expired() : new Response(null, { status: 204 });
  } });
  await client.logout();
  assert.deepEqual(bodies, [{ refreshToken: "old-refresh" }, { refreshToken: "new-refresh" }]);
  assert.equal(client.getSession(), null);
});

test("재발급 이후에도 만료 응답이면 무한 재시도하지 않는다", async () => {
  let calls = 0;
  const client = createApiClient({ storage: storage(), fetchImpl: async (url) => {
    calls++; return url.endsWith("/auth/reissue") ? Response.json(rotated) : expired();
  } });
  await assert.rejects(client.request("/products"), { code: "EXPIRED_TOKEN" });
  assert.equal(calls, 3); assert.equal(client.getSession(), null);
});

test("입력 오류의 필드 정보는 보존하고 서버 실패를 더미로 바꾸지 않는다", async () => {
  const errors = [{ field: "email", reason: "이메일 오류" }];
  const client = createApiClient({ fetchImpl: async () => Response.json({ code: "INVALID_INPUT", message: "입력 오류", errors }, { status: 400 }) });
  await assert.rejects(client.request("/auth/signup", { auth: false }), (error) => {
    assert.deepEqual(error.errors, errors); assert.equal(error.status, 400); return true;
  });
});

test("손상되거나 차단된 저장소에서도 공개 요청을 보낼 수 있다", async () => {
  const client = createApiClient({ storage: { getItem() { throw new Error("denied"); } }, fetchImpl: async (_, options) => {
    assert.equal(options.headers.Authorization, undefined); return Response.json([]);
  } });
  assert.deepEqual(await client.request("/categories"), []);
});

test("프로필 수정 뒤 저장된 사용자 정보를 바꾸고, 다른 계정의 늦은 갱신은 무시한다", () => {
  const saved = storage();
  const client = createApiClient({ storage: saved, fetchImpl: async () => Response.json({}) });
  let notified = 0;
  client.subscribe(() => notified++);

  client.updateUser(1, { nickname: "새이름" });
  assert.equal(client.getSession().user.nickname, "새이름");
  assert.equal(client.getSession().accessToken, "old-access");
  assert.equal(JSON.parse(saved.getItem()).user.nickname, "새이름");
  assert.equal(notified, 1);

  client.updateUser(999, { nickname: "남의이름" });
  assert.equal(client.getSession().user.nickname, "새이름");
  client.clearSession();
  client.updateUser(1, { nickname: "로그아웃뒤" });
  assert.equal(client.getSession(), null);
});

// ---------- 로그인 상태 유지 ----------

/** 빈 저장소. 로그인 전이라 저장된 세션이 없다. */
function emptyStorage() {
  let saved = null;
  return { getItem: () => saved, setItem: (_, value) => { saved = value; }, removeItem: () => { saved = null; } };
}
const loginOk = async () => Response.json(original);

test("로그인 상태 유지를 켜면 오래 남는 저장소에 넣고 탭 저장소는 비운다", async () => {
  const tab = emptyStorage(); const keep = emptyStorage();
  const client = createApiClient({ storage: tab, persistentStorage: keep, fetchImpl: loginOk });

  await client.login({ email: "a@b.c", password: "x" }, { remember: true });

  assert.equal(JSON.parse(keep.getItem()).refreshToken, "old-refresh");
  assert.equal(tab.getItem(), null);
});

test("로그인 상태 유지를 끄면 탭 저장소에만 넣는다", async () => {
  const tab = emptyStorage(); const keep = emptyStorage();
  const client = createApiClient({ storage: tab, persistentStorage: keep, fetchImpl: loginOk });

  await client.login({ email: "a@b.c", password: "x" });

  assert.equal(JSON.parse(tab.getItem()).refreshToken, "old-refresh");
  assert.equal(keep.getItem(), null);
});

test("오래 남는 저장소의 세션을 먼저 복원하고, 갱신도 그쪽에 이어 쓴다", async () => {
  const tab = emptyStorage(); const keep = storage();
  const client = createApiClient({ storage: tab, persistentStorage: keep, fetchImpl: async (url, options) => {
    if (url.endsWith("/auth/reissue")) return Response.json(rotated);
    return options.headers.Authorization === "Bearer old-access" ? expired() : Response.json({ ok: true });
  } });
  assert.equal(client.getSession().user.nickname, "사용자");

  await client.request("/me");

  assert.equal(JSON.parse(keep.getItem()).refreshToken, "new-refresh");
  assert.equal(tab.getItem(), null);
});

test("유지를 껐다가 켜면 이전 저장소에 세션이 남지 않는다", async () => {
  const tab = storage(); const keep = emptyStorage();
  const client = createApiClient({ storage: tab, persistentStorage: keep, fetchImpl: loginOk });

  await client.login({ email: "a@b.c", password: "x" }, { remember: true });

  assert.equal(tab.getItem(), null);
  assert.ok(keep.getItem());
});

test("본문이 없는 성공 응답은 204 가 아니어도 null 이다(차단은 201 에 본문이 없다)", async () => {
  const client = createApiClient({ fetchImpl: async () => new Response(null, { status: 201 }) });
  assert.equal(await client.request("/users/8/block", { method: "POST", auth: false }), null);
});

test("본문이 없는 실패 응답은 성공으로 넘기지 않는다", async () => {
  const client = createApiClient({ fetchImpl: async () => new Response(null, { status: 502 }) });
  await assert.rejects(client.request("/products", { auth: false }), { status: 502, code: "INVALID_RESPONSE" });
});

test("JSON 이 아닌 본문(프록시 오류 페이지 등)은 확인할 수 없는 응답으로 알린다", async () => {
  const client = createApiClient({ fetchImpl: async () => new Response("<html>Bad Gateway</html>", { status: 502 }) });
  await assert.rejects(client.request("/products", { auth: false }), { code: "INVALID_RESPONSE" });
});
