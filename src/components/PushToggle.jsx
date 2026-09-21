import { useEffect, useMemo, useRef, useState } from "react";
import { deletePushSubscription, fetchPushPublicKey, savePushSubscription } from "../api/pushApi.js";
import { currentSubscription, detectPushSupport, disablePush, enablePush } from "../push.js";
import { toast } from "../toast.js";
import styles from "./PushToggle.module.css";

const api = { fetchPublicKey: () => fetchPushPublicKey(), save: savePushSubscription, remove: deletePushSubscription };

/**
 * 마이페이지의 "휴대폰 알림" 줄. 켜면 앱을 닫아도 채팅·거래 알림이 온다.
 *
 * 기기마다 다르다 — 폰에서 켜도 PC 에는 오지 않는다. 그래서 상태는 서버가 아니라 이 브라우저의 구독으로 판단한다.
 * 서버에 키가 없으면(enabled=false) 줄 자체를 숨긴다(누를 수 없는 기능을 보여 주지 않는다).
 */
export default function PushToggle() {
  const support = useMemo(() => detectPushSupport(), []);
  const [state, setState] = useState({ loading: support === "supported", enabled: false, subscribed: false });
  const [permission, setPermission] = useState(() => globalThis.Notification?.permission ?? "default");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    if (support !== "supported") return undefined;
    let alive = true;
    Promise.all([fetchPushPublicKey(), currentSubscription(navigator.serviceWorker)])
      .then(([key, subscription]) => {
        if (alive) setState({ loading: false, enabled: key.enabled, subscribed: !!subscription && Notification.permission === "granted" });
      })
      .catch(() => { if (alive) setState({ loading: false, enabled: false, subscribed: false }); });
    return () => { alive = false; };
  }, [support]);

  async function toggle() {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      if (state.subscribed) {
        await disablePush({ container: navigator.serviceWorker, api });
        setState((old) => ({ ...old, subscribed: false }));
        toast.show("이 기기의 알림을 껐어요.");
        return;
      }
      // 권한 요청은 누른 그 처리 안에서 바로 해야 한다(사파리). 그래서 await 전에 다른 일을 하지 않는다.
      const result = await enablePush({ container: navigator.serviceWorker, notification: Notification, api });
      setPermission(Notification.permission);
      if (result.ok) {
        setState((old) => ({ ...old, subscribed: true }));
        toast.success("이제 앱을 닫아도 채팅·거래 알림을 받아요.");
      } else if (result.reason === "no-worker") {
        toast.error("배포된 앱에서만 켤 수 있어요(개발 서버에는 서비스 워커가 없어요).");
      } else if (result.reason === "disabled") {
        setState((old) => ({ ...old, enabled: false }));
      }
      // denied 는 아래 안내 문구가 대신한다. dismissed(창을 그냥 닫음)는 아무것도 하지 않는다.
    } catch (error) {
      toast.error(error.message || "알림 설정을 바꾸지 못했어요.");
    } finally {
      pending.current = false; setBusy(false);
    }
  }

  if (support === "supported" && !state.loading && !state.enabled) return null;

  let note;
  if (support === "needs-install") {
    note = "아이폰은 Safari 에서 공유 → \"홈 화면에 추가\" 한 앱에서만 알림을 받을 수 있어요.";
  } else if (support === "unsupported") {
    note = "이 브라우저는 알림을 지원하지 않아요.";
  } else if (permission === "denied") {
    note = "알림이 차단돼 있어요. 기기 설정에서 골목마켓 알림을 허용해 주세요.";
  } else {
    note = state.subscribed ? "이 기기로 채팅·거래 알림을 받고 있어요." : "앱을 닫아도 채팅·거래 알림을 받을 수 있어요.";
  }
  const canToggle = support === "supported" && !state.loading && permission !== "denied";

  return <section className={styles.row} aria-label="휴대폰 알림">
    <div className={styles.text}>
      <strong>휴대폰 알림</strong>
      <span id="push-note">{note}</span>
    </div>
    {canToggle && <button className={state.subscribed ? "btn btn-outline btn-sm" : "btn btn-primary btn-sm"}
      onClick={toggle} disabled={busy} aria-pressed={state.subscribed} aria-describedby="push-note">
      {busy ? "처리 중…" : state.subscribed ? "끄기" : "켜기"}</button>}
  </section>;
}
