import { client } from "./client.js";

/** 서버의 VAPID 공개키. enabled 가 false 면 서버에 키가 없어 푸시가 꺼져 있다. */
export const fetchPushPublicKey = (signal) => client.request("/push/public-key", { signal });

/** 브라우저의 PushSubscription 중 서버가 쓰는 것만 보낸다(expirationTime 등은 뺀다). */
export const savePushSubscription = ({ endpoint, keys }) =>
  client.request("/push/subscriptions", { method: "POST", body: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } });

/** 구독 주소는 기기 식별자라 주소창(쿼리)이 아니라 본문으로 보낸다. */
export const deletePushSubscription = (endpoint) =>
  client.request("/push/subscriptions", { method: "DELETE", body: { endpoint } });
