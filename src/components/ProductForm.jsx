import { useEffect, useRef, useState } from "react";
import Modal from "./Modal.jsx";
import { fetchMe } from "../api/userApi.js";
import { createProduct, updateProduct } from "../api/productApi.js";
import { uploadImages } from "../api/imageApi.js";
import Icon from "./Icon.jsx";
import PhotoSorter from "./PhotoSorter.jsx";
import styles from "./ProductForm.module.css";

/** 서버가 주는 필드 이름을 화면의 항목 이름으로 옮긴다. 모르는 이름은 그대로 보여 준다(새 필드가 생겨도 안 깨진다). */
const LABELS = {
  title: "제목", description: "설명", price: "가격", categoryId: "카테고리",
  regionId: "거래 동네", tradeType: "거래 방식", isNegotiable: "가격 제안", imageUrls: "사진",
};
/** 입력칸 옆에 직접 붙일 수 있는 필드. 나머지는 폼 아래 목록으로 보여 준다. */
const INLINE = ["title", "description", "price", "categoryId", "regionId"];

const TRADE_TYPES = [{ value: "DIRECT", label: "직거래" }, { value: "DELIVERY", label: "택배거래" }];
/** "1000000" → "1,000,000". 빈 값은 빈 값 그대로다(0 을 미리 채우지 않는다). */
const formatDigits = (value) => value === "" || value == null ? "" : Number(value).toLocaleString("ko-KR");

export default function ProductForm({ product, categories, onClose, onSaved, onVerifyRegion }) {
  const [form, setForm] = useState({ title: product?.title ?? "", description: product?.description ?? "",
    price: product?.price != null ? String(product.price) : "", categoryId: product?.categoryId ?? "", regionId: product?.regionId ?? "",
    isNegotiable: product?.isNegotiable ?? false, tradeType: product?.tradeType ?? "DIRECT" });
  const [photos, setPhotos] = useState(product?.images.map((image) => image.imageUrl) ?? []);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
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
    setError(""); setErrors([]); setFieldErrors({});
    if (!photos.length) { setError("사진을 한 장 이상 올려 주세요."); return; }
    if (external) { setError("기존 외부 사진을 삭제하고 사진을 다시 업로드해 주세요."); return; }
    if (!Number.isSafeInteger(Number(form.price)) || Number(form.price) > 2147483647) {
      setError("가격은 0~2,147,483,647원 사이의 정수로 입력해 주세요."); return;
    }
    /*
     * 서버로는 앞뒤 공백을 걷어낸 값을 보내므로, 검사도 그 값으로 해야 한다.
     * 입력칸의 minLength 는 공백까지 센다. "짧음      " 처럼 쓰면 브라우저는 통과시키고 서버가 되돌려준다.
     */
    const title = form.title.trim();
    const description = form.description.trim();
    const local = {};
    if (title.length < 2 || title.length > 100) local.title = "제목은 2자 이상 100자 이하로 입력해 주세요.";
    if (description.length < 10) local.description = "설명은 10자 이상 입력해 주세요.";
    if (Object.keys(local).length) { setFieldErrors(local); setError("입력을 다시 확인해 주세요."); return; }

    pending.current = true; setBusy("save");
    try {
      const body = { ...form, title, description,
        price: Number(form.price), categoryId: Number(form.categoryId), regionId: Number(form.regionId), imageUrls: photos };
      const saved = product ? await updateProduct(product.id, body) : await createProduct(body);
      if (alive.current) onSaved(saved);
    } catch (e) {
      if (!alive.current) return;
      const list = e.errors ?? [];
      setError(e.message); setErrors(list);
      // 입력칸이 있는 필드는 그 옆에 붙인다. 폼 아래 한 줄로만 보이면 어디를 고칠지 알 수 없다.
      setFieldErrors(Object.fromEntries(list.filter((item) => INLINE.includes(item.field))
        .map(({ field, reason }) => [field, reason])));
    }
    finally { pending.current = false; if (alive.current) setBusy(""); }
  }

  /** 입력칸 아래에 붙는 오류 문구. 보조기기에는 aria-describedby 로 연결한다. */
  const fieldError = (name) => fieldErrors[name]
    ? <span className={styles.fieldError} id={`${name}-error`}>{fieldErrors[name]}</span>
    : null;
  const invalid = (name) => ({
    "aria-invalid": fieldErrors[name] ? true : undefined,
    "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined,
  });

  return <Modal title={product ? "상품 수정" : "상품 등록"} busy={!!busy} onClose={() => { if (!pending.current) onClose(); }}>
    {loading && <p role="status">인증한 동네를 불러오고 있어요…</p>}
    {loadError && <p className={styles.error} role="alert">{loadError} <button onClick={() => setReload((v) => v + 1)}>다시 시도</button></p>}
    {!loading && !loadError && !regions.length && <div><p>상품을 등록하려면 먼저 동네를 인증해 주세요.</p><button onClick={onVerifyRegion}>내 동네 인증하기</button></div>}
    {!loading && !loadError && regions.length > 0 && <form onSubmit={submit} className={styles.form}>
      <fieldset disabled={!!busy} className={styles.fields}>
        {/* 중고거래는 사진이 먼저다. 맨 위에 둔다(2026-09-21). */}
        <p className={styles.label} id="product-photos">사진</p>
        <p className={styles.note}>JPG·PNG·WEBP, 장당 5MB까지. 끌어서 순서를 바꿀 수 있고 맨 앞이 대표 사진이에요.</p>
        {external && <p className={styles.error}>기존 외부 사진은 수정 시 사용할 수 없어요. 삭제한 뒤 새 사진을 올려 주세요.</p>}
        {/*
          기본 <input type="file"> 의 "파일 선택" 버튼은 브라우저마다 생김새가 다르고 화면과 따로 논다.
          입력칸은 라벨 안에 숨기고, 카메라 타일을 눌러 열게 한다(라벨을 누르면 숨긴 입력이 열린다).
          장수는 타일 안에 두어 몇 장 더 올릴 수 있는지 사진 옆에서 바로 보인다.
        */}
        <PhotoSorter photos={photos} onReorder={setPhotos}
          onRemove={(index) => setPhotos((old) => old.filter((_, i) => i !== index))}>
          <label className={styles.picker + (photos.length >= 10 ? " " + styles.pickerFull : "")}>
            <Icon name="camera" size={26} />
            <span className={styles.pickerCount}>{photos.length}/10</span>
            <span className="sr-only">사진 추가</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={upload}
              disabled={photos.length >= 10 || busy === "upload"} />
          </label>
        </PhotoSorter>
        <label>제목<input required minLength={2} maxLength={100} value={form.title} onChange={set("title")} {...invalid("title")} />{fieldError("title")}</label>
        <label>설명
          <textarea required minLength={10} rows={5} value={form.description} onChange={set("description")} {...invalid("description")} />
          <span className={styles.note}>10자 이상 입력해 주세요. 상태·사용 기간·거래 방법을 적으면 좋아요.</span>
          {fieldError("description")}</label>
        {/*
          가격은 숫자 입력칸(type="number")이 아니라 글자 칸에 숫자 키패드(inputMode)다. 숫자 칸은 쉼표를 찍을 수 없어
          1000000 의 자릿수가 한눈에 안 보였다. 상태에는 숫자만 두고 보일 때만 쉼표를 찍는다.
        */}
        <label>가격<span className={styles.money}>
          <input required inputMode="numeric" autoComplete="off" value={formatDigits(form.price)} placeholder="0"
            onChange={(e) => setForm((old) => ({ ...old, price: e.target.value.replace(/D/g, "").replace(/^0+(?=d)/, "").slice(0, 10) }))}
            {...invalid("price")} />
          <span aria-hidden="true">원</span></span>{fieldError("price")}</label>
        <label>카테고리<select required value={form.categoryId} onChange={set("categoryId")} {...invalid("categoryId")}><option value="">선택해 주세요</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{fieldError("categoryId")}</label>
        {!categories.length && <p className={styles.error}>카테고리를 불러오지 못했습니다. 화면을 닫고 카테고리 조회를 다시 시도해 주세요.</p>}
        <label>거래 동네<select required value={form.regionId} onChange={set("regionId")} {...invalid("regionId")}>
          {regions.map((region) => <option key={region.id} value={region.id}>{region.name}{region.isPrimary ? " (대표)" : ""}</option>)}</select>{fieldError("regionId")}</label>
        {/* 선택지가 둘뿐이라 목록을 여는 대신 한 번에 보이는 두 칸으로 고른다. */}
        <div className={styles.group}>
          <p className={styles.label} id="trade-type">거래 방식</p>
          <div className="seg" role="group" aria-labelledby="trade-type">
            {TRADE_TYPES.map((option) => <button key={option.value} type="button" className="seg-item"
              aria-pressed={form.tradeType === option.value}
              onClick={() => setForm((old) => ({ ...old, tradeType: option.value }))}>{option.label}</button>)}
          </div>
        </div>
        <label className={styles.check}><input type="checkbox" checked={form.isNegotiable} onChange={(e) => setForm((old) => ({ ...old, isNegotiable: e.target.checked }))} />가격 제안 가능</label>
      </fieldset>
      {error && <div className={styles.error} role="alert">{error}
        {errors.some((item) => !INLINE.includes(item.field)) && <ul>
          {errors.filter((item) => !INLINE.includes(item.field))
            .map((item, i) => <li key={i}>{LABELS[item.field] ?? item.field}: {item.reason}</li>)}</ul>}</div>}
      {busy === "upload" && <p role="status">사진을 업로드하고 있어요…</p>}
      <button className={styles.submit} type="submit" disabled={!!busy || !categories.length || external}>{busy === "save" ? "저장 중…" : product ? "수정 완료" : "등록하기"}</button>
    </form>}
  </Modal>;
}
