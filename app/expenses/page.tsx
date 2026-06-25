"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase, uploadPhoto } from "@/lib/supabase";
import { fileToResizedDataUrl, dataUrlToFile } from "@/lib/image";
import { CATEGORIES, EXPENSE_SORTS, type Expense, type ExpenseItem, type ExpenseSortKey } from "@/lib/types";
import { Header, Spinner, CategoryChip, Lightbox } from "@/components/ui";
import InAppCamera from "@/components/InAppCamera";

type Draft = Omit<Expense, "id" | "created_at"> & { id?: string };

const emptyDraft = (): Draft => ({
  store: "",
  purchase_date: new Date().toISOString().slice(0, 10),
  purchase_time: new Date().toTimeString().slice(0, 5),
  total: 0,
  currency: "JPY",
  category: "식비",
  items: [],
  note: "",
  image_url: null,
});

function ExpensesInner() {
  const params = useSearchParams();
  const [list, setList] = useState<Expense[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [showCam, setShowCam] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ExpenseSortKey>("date_desc");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [groupByDay, setGroupByDay] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase.from("expenses").select("*");
    if (data) setList(data as Expense[]);
  }
  useEffect(() => {
    load();
    if (params.get("new") === "1") fileRef.current?.click();
  }, []); // eslint-disable-line

  const sorted = useMemo(() => {
    const arr = [...list];
    switch (sortKey) {
      case "date_asc":
        arr.sort((a, b) => `${a.purchase_date}${a.purchase_time || ""}`.localeCompare(`${b.purchase_date}${b.purchase_time || ""}`));
        break;
      case "category":
        arr.sort((a, b) => (a.category || "").localeCompare(b.category || "") || (b.purchase_date || "").localeCompare(a.purchase_date || ""));
        break;
      case "amount_desc":
        arr.sort((a, b) => (b.total || 0) - (a.total || 0));
        break;
      default: // date_desc
        arr.sort((a, b) => `${b.purchase_date}${b.purchase_time || ""}`.localeCompare(`${a.purchase_date}${a.purchase_time || ""}`));
    }
    return arr;
  }, [list, sortKey]);

  // 종류 필터 적용
  const filtered = useMemo(
    () => (activeCat ? sorted.filter((e) => e.category === activeCat) : sorted),
    [sorted, activeCat]
  );

  // 날짜별 그룹 (최신 날짜 먼저, 같은 날 내 시간순)
  const dayGroups = useMemo(() => {
    const map: Record<string, Expense[]> = {};
    for (const e of filtered) (map[e.purchase_date || "날짜 미정"] ||= []).push(e);
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.purchase_time || "").localeCompare(b.purchase_time || ""));
    }
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  async function analyzeAndOpen(dataUrl: string) {
    setAnalyzing(true);
    setPendingImage(dataUrl);
    try {
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const d = json.data;
      setDraft({
        ...emptyDraft(),
        store: d.store || "",
        purchase_date: d.purchase_date || emptyDraft().purchase_date,
        purchase_time: d.purchase_time || null,
        total: Number(d.total) || 0,
        currency: d.currency || "JPY",
        category: d.category || "식비",
        items: Array.isArray(d.items) ? d.items : [],
        note: d.note || "",
      });
    } catch (err: any) {
      alert("분석 실패: " + err.message + "\n직접 입력으로 전환합니다.");
      setDraft(emptyDraft());
    } finally {
      setAnalyzing(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    analyzeAndOpen(await fileToResizedDataUrl(file));
  }

  function editExisting(e: Expense) {
    setPendingImage(null);
    setDraft({ ...e, items: e.items || [] });
  }

  async function save() {
    if (!draft) return;
    setLoading(true);
    try {
      let image_url = draft.image_url;
      if (pendingImage) {
        image_url = await uploadPhoto(dataUrlToFile(pendingImage, "receipt.jpg"), "receipts");
      }
      const payload = {
        store: draft.store,
        purchase_date: draft.purchase_date,
        purchase_time: draft.purchase_time,
        total: draft.total,
        currency: draft.currency,
        category: draft.category,
        items: draft.items,
        note: draft.note,
        image_url,
      };
      if (draft.id) {
        await supabase.from("expenses").update(payload).eq("id", draft.id);
      } else {
        await supabase.from("expenses").insert(payload);
      }
      setDraft(null);
      setPendingImage(null);
      await load();
    } catch (err: any) {
      alert("저장 실패: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("이 기록을 삭제할까요?")) return;
    await supabase.from("expenses").delete().eq("id", id);
    await load();
  }

  const total = list.reduce((s, e) => s + (e.total || 0), 0);

  return (
    <>
      <Header
        title="가계부"
        subtitle={`총 ¥${Math.round(total).toLocaleString()} · ${list.length}건`}
        right={
          <button className="btn-accent text-sm" onClick={() => fileRef.current?.click()}>
            🖼 앨범
          </button>
        }
      />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      {showCam && (
        <InAppCamera onClose={() => setShowCam(false)} onCapture={(d) => { setShowCam(false); analyzeAndOpen(d); }} />
      )}
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}

      <div className="space-y-3 p-4">
        <div className="flex gap-2">
          <button className="btn-accent flex-1 text-sm" onClick={() => setShowCam(true)}>📷 사진 촬영</button>
          <button className="btn-ghost flex-1 text-sm" onClick={() => setDraft(emptyDraft())}>+ 직접 입력</button>
        </div>

        {list.length > 0 && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <select className="field py-1.5" value={sortKey} onChange={(e) => setSortKey(e.target.value as ExpenseSortKey)}>
                {EXPENSE_SORTS.map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
              </select>
              <button
                className={`chip shrink-0 py-2 ${groupByDay ? "bg-ink text-white" : "bg-white text-muted border border-line"}`}
                onClick={() => setGroupByDay((g) => !g)}
              >
                📅 날짜별
              </button>
            </div>

            {/* 종류 토글 필터 */}
            <div className="flex flex-wrap gap-1.5">
              <button
                className={`chip ${activeCat === null ? "bg-transit text-white" : "bg-white text-muted border border-line"}`}
                onClick={() => setActiveCat(null)}
              >
                전체
              </button>
              {CATEGORIES.map((c) => {
                const sum = list.filter((e) => e.category === c).reduce((s, e) => s + (e.total || 0), 0);
                if (sum === 0) return null;
                return (
                  <button
                    key={c}
                    className={`chip ${activeCat === c ? "bg-transit text-white" : "bg-white text-muted border border-line"}`}
                    onClick={() => setActiveCat(activeCat === c ? null : c)}
                  >
                    {c} ¥{Math.round(sum).toLocaleString()}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {analyzing && (
          <div className="card p-4"><Spinner label="영수증을 읽는 중…" /></div>
        )}

        {list.length === 0 && !analyzing && (
          <div className="card p-8 text-center text-sm text-muted">
            영수증을 찍으면 자동으로 항목·금액·시간이 정리돼요.
          </div>
        )}

        {/* 날짜별 보기 */}
        {groupByDay
          ? dayGroups.map(([day, rows]) => {
              const daySum = rows.reduce((s, e) => s + (e.total || 0), 0);
              return (
                <section key={day}>
                  <div className="mb-1.5 flex items-center justify-between px-1">
                    <h2 className="font-round font-bold text-ink">{day}</h2>
                    <span className="font-round font-bold text-torii">¥{Math.round(daySum).toLocaleString()}</span>
                  </div>
                  <div className="space-y-2">
                    {rows.map((e) => (
                      <ExpenseCard key={e.id} e={e} onZoom={setLightbox} onEdit={editExisting} onRemove={remove} />
                    ))}
                  </div>
                </section>
              );
            })
          : filtered.map((e) => (
              <ExpenseCard key={e.id} e={e} onZoom={setLightbox} onEdit={editExisting} onRemove={remove} />
            ))}
      </div>

      {draft && (
        <EditSheet
          draft={draft}
          setDraft={setDraft}
          pendingImage={pendingImage}
          onClose={() => { setDraft(null); setPendingImage(null); }}
          onSave={save}
          saving={loading}
        />
      )}
    </>
  );
}

function ExpenseCard({
  e, onZoom, onEdit, onRemove,
}: {
  e: Expense;
  onZoom: (url: string) => void;
  onEdit: (e: Expense) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        {e.image_url && (
          <button onClick={() => onZoom(e.image_url!)} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CategoryChip value={e.category} />
                <p className="truncate font-medium text-ink">{e.store || "이름 없음"}</p>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {e.purchase_date}{e.purchase_time ? ` · ${e.purchase_time}` : ""}
              </p>
            </div>
            <p className="shrink-0 font-round text-lg font-bold text-ink">
              ¥{Math.round(e.total || 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
      {e.items?.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm text-muted">
          {e.items.slice(0, 4).map((it, i) => (
            <li key={i} className="flex justify-between">
              <span className="truncate">{it.name}{it.qty && it.qty > 1 ? ` ×${it.qty}` : ""}</span>
              <span>¥{Number(it.price).toLocaleString()}</span>
            </li>
          ))}
          {e.items.length > 4 && <li className="text-xs">외 {e.items.length - 4}개</li>}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <button className="btn-ghost flex-1 text-sm" onClick={() => onEdit(e)}>수정</button>
        <button className="btn-ghost text-sm text-torii" onClick={() => onRemove(e.id)}>삭제</button>
      </div>
    </div>
  );
}

function EditSheet({
  draft, setDraft, pendingImage, onClose, onSave, saving,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  pendingImage: string | null;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const up = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const upItem = (i: number, patch: Partial<ExpenseItem>) => {
    const items = [...draft.items];
    items[i] = { ...items[i], ...patch };
    up({ items });
  };
  const itemsTotal = draft.items.reduce((s, it) => s + (Number(it.price) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-paper p-4">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <h2 className="mb-3 font-round text-lg font-bold">{draft.id ? "기록 수정" : "새 기록"}</h2>

        {(pendingImage || draft.image_url) && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={pendingImage || draft.image_url!} alt="영수증" className="mb-3 max-h-44 w-full rounded-xl object-cover" />
        )}

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted">가게</span>
            <input className="field mt-1" value={draft.store || ""} onChange={(e) => up({ store: e.target.value })} />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 block text-sm">
              <span className="text-muted">날짜</span>
              <input type="date" className="field mt-1" value={draft.purchase_date || ""} onChange={(e) => up({ purchase_date: e.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="text-muted">시간</span>
              <input type="time" className="field mt-1" value={draft.purchase_time || ""} onChange={(e) => up({ purchase_time: e.target.value })} />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-muted">분류</span>
            <select className="field mt-1" value={draft.category || ""} onChange={(e) => up({ category: e.target.value })}>
              {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </label>

          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted">품목</span>
              <button className="text-transit" onClick={() => up({ items: [...draft.items, { name: "", price: 0, qty: 1 }] })}>+ 추가</button>
            </div>
            <div className="space-y-2">
              {draft.items.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="field flex-1" placeholder="품목" value={it.name} onChange={(e) => upItem(i, { name: e.target.value })} />
                  <input className="field w-24" type="number" placeholder="가격" value={it.price} onChange={(e) => upItem(i, { price: Number(e.target.value) })} />
                  <button className="px-1 text-torii" onClick={() => up({ items: draft.items.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
            </div>
            {draft.items.length > 0 && (
              <button className="mt-1 text-xs text-transit" onClick={() => up({ total: itemsTotal })}>
                품목 합계(¥{itemsTotal.toLocaleString()})로 합계 채우기
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-muted">합계</span>
              <input type="number" className="field mt-1" value={draft.total || 0} onChange={(e) => up({ total: Number(e.target.value) })} />
            </label>
            <label className="block text-sm">
              <span className="text-muted">통화</span>
              <input className="field mt-1" value={draft.currency} onChange={(e) => up({ currency: e.target.value })} />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-muted">메모</span>
            <textarea className="field mt-1" rows={2} value={draft.note || ""} onChange={(e) => up({ note: e.target.value })} />
          </label>
        </div>

        <div className="sticky bottom-0 mt-4 flex gap-2 bg-paper pt-2">
          <button className="btn-ghost flex-1" onClick={onClose} disabled={saving}>취소</button>
          <button className="btn-primary flex-1" onClick={onSave} disabled={saving}>{saving ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}

export default function ExpensesPage() {
  return (
    <Suspense fallback={<Header title="가계부" />}>
      <ExpensesInner />
    </Suspense>
  );
}
