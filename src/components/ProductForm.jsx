import { useEffect, useRef, useState } from "react";
import Modal from "./Modal.jsx";
import { fetchMe } from "../api/userApi.js";
import { createProduct, updateProduct } from "../api/productApi.js";
import { uploadImages } from "../api/imageApi.js";
import styles from "./ProductForm.module.css";

export default function ProductForm({ product, categories, onClose, onSaved, onVerifyRegion }) {
  const [form, setForm] = useState({ title: product?.title ?? "", description: product?.description ?? "",
    price: product?.price ?? "", categoryId: product?.categoryId ?? "", regionId: product?.regionId ?? "",
    isNegotiable: product?.isNegotiable ?? false, tradeType: product?.tradeType ?? "DIRECT" });
  const [photos, setPhotos] = useState(product?.images.map((image) => image.imageUrl) ?? []);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState("");
  const pending = useRef(false);
  const uploadController = useRef(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; uploadController.current?.abort(); };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setLoadError("");
    fetchMe(abort.signal).then((me) => {
      if (abort.signal.aborted) return;
      setRegions(me.regions);
      setForm((old) => ({ ...old, regionId: me.regions.some((r) => r.id === Number(old.regionId))
        ? old.regionId : (me.regions.find((r) => r.isPrimary)?.id ?? me.regions[0]?.id ?? "") }));
      setLoading(false);
    }).catch((e) => { if (!abort.signal.aborted) { setLoadError(e.message); setLoading(false); } });
    return () => abort.abort();
  }, [reload]);

  const set = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  const external = photos.some((url) => !url.startsWith("/api/images/"));
  function move(index, offset) {
    setPhotos((old) => { const next = [...old]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; return next; });
  }
  async function upload(event) {
    const files = [...event.target.files]; event.target.value = "";
    if (!files.length || pending.current) return;
    setError("");
    if (photos.length + files.length > 10) { setError("사진은 총 10장까지 올릴 수 있어요."); return; }
    if (files.some((file) => file.size > 5 * 1024 * 1024 || file.size === 0)) { setError("사진은 빈 파일이 아닌 장당 5MB 이하 파일을 선택해 주세요."); return; }
    pending.current = true; setBusy("upload");
    const abort = new AbortController(); uploadController.current = abort;
    try {
      const result = await uploadImages(files, abort.signal);
      if (alive.current) setPhotos((old) => [...old, ...result.imageUrls]);
    } catch (e) { if (alive.current && e.name !== "AbortError") setError(e.message); }
    finally { pending.current = false; if (alive.current) setBusy(""); }
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    setError(""); setErrors([]);
    if (!photos.length) { setError("사진을 한 장 이상 올려 주세요."); return; }
    if (external) { setError("기존 외부 사진을 삭제하고 사진을 다시 업로드해 주세요."); return; }
    if (!Number.isSafeInteger(Number(form.price)) || Number(form.price) > 2147483647) {
      setError("가격은 0~2,147,483,647원 사이의 정수로 입력해 주세요."); return;
    }
    pending.current = true; setBusy("save");
    try {
      const body = { ...form, title: form.title.trim(), description: form.description.trim(),
        price: Number(form.price), categoryId: Number(form.categoryId), regionId: Number(form.regionId), imageUrls: photos };
      const saved = product ? await updateProduct(product.id, body) : await createProduct(body);
      if (alive.current) onSaved(saved);
    } catch (e) { if (alive.current) { setError(e.message); setErrors(e.errors ?? []); } }
    finally { pending.current = false; if (alive.current) setBusy(""); }
  }

  return <Modal title={product ? "상품 수정" : "상품 등록"} busy={!!busy} onClose={() => { if (!pending.current) onClose(); }}>
    {loading && <p role="status">인증한 동네를 불러오고 있어요…</p>}
    {loadError && <p className={styles.error} role="alert">{loadError} <button onClick={() => setReload((v) => v + 1)}>다시 시도</button></p>}
    {!loading && !loadError && !regions.length && <div><p>상품을 등록하려면 먼저 동네를 인증해 주세요.</p><button onClick={onVerifyRegion}>내 동네 인증하기</button></div>}
    {!loading && !loadError && regions.length > 0 && <form onSubmit={submit} className={styles.form}>
      <fieldset disabled={!!busy} className={styles.fields}>
        <label>제목<input required minLength={2} maxLength={100} value={form.title} onChange={set("title")} /></label>
        <label>설명<textarea required minLength={10} rows={5} value={form.description} onChange={set("description")} /></label>
        <label>가격 (원)<input required type="number" min="0" max="2147483647" step="1" value={form.price} onChange={set("price")} /></label>
        <label>카테고리<select required value={form.categoryId} onChange={set("categoryId")}><option value="">선택해 주세요</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        {!categories.length && <p className={styles.error}>카테고리를 불러오지 못했습니다. 화면을 닫고 카테고리 조회를 다시 시도해 주세요.</p>}
        <label>거래 동네<select required value={form.regionId} onChange={set("regionId")}>
          {regions.map((region) => <option key={region.id} value={region.id}>{region.name}{region.isPrimary ? " (대표)" : ""}</option>)}</select></label>
        <label>거래 방식<select value={form.tradeType} onChange={set("tradeType")}><option value="DIRECT">직거래</option><option value="DELIVERY">택배거래</option></select></label>
        <label className={styles.check}><input type="checkbox" checked={form.isNegotiable} onChange={(e) => setForm((old) => ({ ...old, isNegotiable: e.target.checked }))} />가격 제안 가능</label>
        <label>사진 ({photos.length}/10)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={upload} disabled={photos.length >= 10} /></label>
        <p className={styles.note}>JPG·PNG·WEBP, 장당 5MB까지. 첫 번째 사진이 대표 사진이에요.</p>
        {external && <p className={styles.error}>기존 외부 사진은 수정 시 사용할 수 없어요. 삭제한 뒤 새 사진을 올려 주세요.</p>}
        <ol className={styles.photos}>{photos.map((url, index) => <li key={`${index}-${url}`}>
          <img src={url} alt={`상품 사진 ${index + 1}`} />
          <div><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`사진 ${index + 1} 앞으로`}>←</button>
            <button type="button" disabled={index === photos.length - 1} onClick={() => move(index, 1)} aria-label={`사진 ${index + 1} 뒤로`}>→</button>
            <button type="button" onClick={() => setPhotos((old) => old.filter((_, i) => i !== index))} aria-label={`사진 ${index + 1} 삭제`}>삭제</button></div>
        </li>)}</ol>
      </fieldset>
      {error && <div className={styles.error} role="alert">{error}
        {errors.length > 0 && <ul>{errors.map((item, i) => <li key={i}>{item.field}: {item.reason}</li>)}</ul>}</div>}
      {busy === "upload" && <p role="status">사진을 업로드하고 있어요…</p>}
      <button className={styles.submit} type="submit" disabled={!!busy || !categories.length || external}>{busy === "save" ? "저장 중…" : product ? "수정 완료" : "등록하기"}</button>
    </form>}
  </Modal>;
}
