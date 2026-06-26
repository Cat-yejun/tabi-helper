"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { type ShoppingItem, SHOPPING_CATEGORIES } from "@/lib/types";
import { Header, Spinner } from "@/components/ui";

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [cat, setCat] = useState<string>("기타");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShoppingItem | null>(null);

  async function load() {
    const { data } = await supabase
      .from("shopping_items")
      .select("*")
      .order("checked")
      .order("sort_order")
      .order("created_at");
    setItems((data as ShoppingItem[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    const n = name.trim();
    if (!n) return;
    setName("");
    const { data } = await supabase
      .from("shopping_items")
      .insert({ name: n, category: cat, qty: 1, price: 0, sort_order: items.length })
      .select()
      .single();
    if (data) setItems((arr) => [...arr, data as ShoppingItem]);
  }

  async function toggle(it: ShoppingItem) {
    const checked = !it.checked;
    setItems((arr) => arr.map((x) => (x.id === it.id ? { ...x, checked } : x)));
    await supabase.from("shopping_items").update({ checked }).eq("id", it.id);
  }

  async function patch(id: string, fields: Partial<ShoppingItem>) {
    setItems((arr) => arr.map((x) => (x.id === id ? { ...x, ...fields } : x)));
    await supabase.from("shopping_items").update(fields).eq("id", id);
  }

  async function remove(id: string) {
    setItems((arr) => arr.filter((x) => x.id !== id));
    await supabase.from("shopping_items").delete().eq("id", id);
  }

  async function clearChecked() {
    const ids = items.filter((x) => x.checked).map((x) => x.id);
    if (!ids.length) return;
    if (!confirm("체크된(구매 완료) 항목을 모두 지울까요?")) return;
    setItems((arr) => arr.filter((x) => !x.checked));
    await supabase.from("shopping_items").delete().in("id", ids);
  }

  // 종류 필터 적용
  const filtered = useMemo(
    () => (activeCat ? items.filter((x) => x.category === activeCat) : items),
    [items, activeCat]
  );
  const remaining = filtered.filter((x) => !x.checked);
  const done = filtered.filter((x) => x.checked);

  // 총합: 구매 완료(체크) 항목의 가격×개수 합 = 지금까지 쓴 돈
  const spent = useMemo(
    () => items.filter((x) => x.checked).reduce((s, x) => s + (x.price || 0) * (x.qty || 1), 0),
    [items]
  );
  // 예상 총액(전체 항목)
  const estimated = useMemo(
    () => items.reduce((s, x) => s + (x.price || 0) * (x.qty || 1), 0),
    [items]
  );

  return (
    <>
      <Header
        title="살 것 체크리스트"
        subtitle={items.length ? `${items.filter((x) => x.checked).length}/${items.length} 구매` : "쇼핑 메모"}
        right={items.some((x) => x.checked) ? <button className="text-xs text-torii" onClick={clearChecked}>완료 비우기</button> : undefined}
      />

      <div className="space-y-4 p-4">
        {/* 총합 카드 */}
        {items.length > 0 && (
          <div className="card flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted">지금까지 쓴 돈 (구매 완료)</p>
              <p className="font-round text-2xl font-extrabold text-torii">¥{Math.round(spent).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">예상 총액 (전체)</p>
              <p className="font-round text-lg font-bold text-ink">¥{Math.round(estimated).toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* 입력 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              className="field flex-1"
              placeholder="살 것을 입력하세요"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <button className="btn-primary shrink-0 px-4" onClick={add} disabled={!name.trim()}>추가</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SHOPPING_CATEGORIES.map((c) => (
              <button
                key={c}
                className={`chip ${cat === c ? "bg-ink text-white" : "bg-white text-muted border border-line"}`}
                onClick={() => setCat(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* 종류 필터 */}
        {items.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              className={`chip ${activeCat === null ? "bg-transit text-white" : "bg-white text-muted border border-line"}`}
              onClick={() => setActiveCat(null)}
            >
              전체
            </button>
            {SHOPPING_CATEGORIES.map((c) => {
              const sum = items.filter((x) => x.category === c).reduce((s, x) => s + (x.price || 0) * (x.qty || 1), 0);
              const count = items.filter((x) => x.category === c).length;
              if (count === 0) return null;
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
        )}

        {loading ? (
          <Spinner label="불러오는 중…" />
        ) : items.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted">
            여행 중 살 것을 미리 적어두세요. 가격·개수를 넣으면 총액이 자동 계산돼요.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {remaining.map((it) => (
                <Row key={it.id} it={it} onToggle={toggle} onPatch={patch} onRemove={remove} onEdit={() => setEditing(it)} />
              ))}
            </div>
            {done.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-xs font-medium text-muted">구매 완료 ({done.length})</p>
                <div className="space-y-2">
                  {done.map((it) => (
                    <Row key={it.id} it={it} onToggle={toggle} onPatch={patch} onRemove={remove} onEdit={() => setEditing(it)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <EditSheet item={editing} onClose={() => setEditing(null)} onSave={async (f) => { await patch(editing.id, f); setEditing(null); }} />
      )}
    </>
  );
}

function Row({
  it, onToggle, onPatch, onRemove, onEdit,
}: {
  it: ShoppingItem;
  onToggle: (it: ShoppingItem) => void;
  onPatch: (id: string, f: Partial<ShoppingItem>) => void;
  onRemove: (id: string) => void;
  onEdit: () => void;
}) {
  const lineTotal = (it.price || 0) * (it.qty || 1);
  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onToggle(it)}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
            it.checked ? "border-transit bg-transit text-white" : "border-line bg-white"
          }`}
        >
          {it.checked && "✓"}
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
          <span className={`text-sm ${it.checked ? "text-muted line-through" : "text-ink"}`}>{it.name}</span>
          <span className="ml-2 text-[11px] text-muted">{it.category}</span>
        </button>
        <span className="shrink-0 font-round text-sm font-bold text-ink">
          {lineTotal > 0 ? `¥${Math.round(lineTotal).toLocaleString()}` : "—"}
        </span>
      </div>
      {/* 가격/개수 인라인 입력 */}
      <div className="mt-2 flex items-center gap-2 pl-9 text-xs">
        <span className="text-muted">단가</span>
        <div className="flex items-center rounded-lg border border-line bg-white px-2">
          <span className="text-muted">¥</span>
          <input
            type="number"
            inputMode="numeric"
            className="w-16 bg-transparent py-1 text-right outline-none"
            value={it.price || ""}
            placeholder="0"
            onChange={(e) => onPatch(it.id, { price: Number(e.target.value) || 0 })}
          />
        </div>
        <span className="text-muted">개수</span>
        <div className="flex items-center rounded-lg border border-line bg-white">
          <button className="px-2 py-1 text-muted" onClick={() => onPatch(it.id, { qty: Math.max(1, (it.qty || 1) - 1) })}>−</button>
          <span className="w-6 text-center">{it.qty || 1}</span>
          <button className="px-2 py-1 text-muted" onClick={() => onPatch(it.id, { qty: (it.qty || 1) + 1 })}>+</button>
        </div>
        <button className="ml-auto text-torii" onClick={() => onRemove(it.id)}>삭제</button>
      </div>
    </div>
  );
}

function EditSheet({
  item, onClose, onSave,
}: {
  item: ShoppingItem;
  onClose: () => void;
  onSave: (f: Partial<ShoppingItem>) => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [note, setNote] = useState(item.note || "");

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-paper p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <h2 className="mb-3 font-round text-lg font-bold">항목 수정</h2>
        <label className="mb-2 block text-sm">
          <span className="text-muted">이름</span>
          <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="mb-2">
          <span className="text-sm text-muted">종류</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {SHOPPING_CATEGORIES.map((c) => (
              <button
                key={c}
                className={`chip ${category === c ? "bg-ink text-white" : "bg-white text-muted border border-line"}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-sm">
          <span className="text-muted">메모</span>
          <input className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 면세 가능, 3층" />
        </label>
        <button className="btn-primary mt-4 w-full" onClick={() => onSave({ name: name.trim() || item.name, category, note: note || null })}>
          저장
        </button>
        <button className="btn-ghost mt-2 w-full" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
