"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ShoppingItem } from "@/lib/types";
import { Header, Spinner } from "@/components/ui";

const SUGGESTIONS = ["로이스 초콜릿", "시로이 코이비토", "감자 포카칩", "약/비타민", "기념품", "화장품"];

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

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

  async function add(text?: string) {
    const n = (text ?? name).trim();
    if (!n) return;
    setName("");
    const { data } = await supabase
      .from("shopping_items")
      .insert({ name: n, sort_order: items.length })
      .select()
      .single();
    if (data) setItems((arr) => [...arr, data as ShoppingItem]);
  }

  async function toggle(it: ShoppingItem) {
    const checked = !it.checked;
    setItems((arr) => arr.map((x) => (x.id === it.id ? { ...x, checked } : x)));
    await supabase.from("shopping_items").update({ checked }).eq("id", it.id);
  }

  async function remove(id: string) {
    setItems((arr) => arr.filter((x) => x.id !== id));
    await supabase.from("shopping_items").delete().eq("id", id);
  }

  async function clearChecked() {
    const ids = items.filter((x) => x.checked).map((x) => x.id);
    if (!ids.length) return;
    if (!confirm("체크된 항목을 모두 지울까요?")) return;
    setItems((arr) => arr.filter((x) => !x.checked));
    await supabase.from("shopping_items").delete().in("id", ids);
  }

  const remaining = items.filter((x) => !x.checked);
  const done = items.filter((x) => x.checked);

  return (
    <>
      <Header
        title="살 것 체크리스트"
        subtitle={items.length ? `${done.length}/${items.length} 완료` : "쇼핑 메모"}
        right={done.length ? <button className="text-xs text-torii" onClick={clearChecked}>완료 비우기</button> : undefined}
      />

      <div className="space-y-4 p-4">
        {/* 입력 */}
        <div className="flex items-center gap-2">
          <input
            className="field flex-1"
            placeholder="살 것을 입력하세요"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn-primary shrink-0 px-4" onClick={() => add()} disabled={!name.trim()}>추가</button>
        </div>

        {/* 추천 칩 */}
        {items.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip bg-white text-muted border border-line" onClick={() => add(s)}>
                + {s}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <Spinner label="불러오는 중…" />
        ) : items.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted">
            여행 중 살 것을 미리 적어두세요. 체크하면 아래로 정리돼요.
          </div>
        ) : (
          <div className="space-y-4">
            {/* 남은 항목 */}
            <div className="space-y-2">
              {remaining.map((it) => (
                <Row key={it.id} it={it} onToggle={toggle} onRemove={remove} />
              ))}
            </div>

            {/* 완료 항목 */}
            {done.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-xs font-medium text-muted">완료 ({done.length})</p>
                <div className="space-y-2">
                  {done.map((it) => (
                    <Row key={it.id} it={it} onToggle={toggle} onRemove={remove} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Row({
  it, onToggle, onRemove,
}: {
  it: ShoppingItem;
  onToggle: (it: ShoppingItem) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="card flex items-center gap-3 p-3">
      <button
        onClick={() => onToggle(it)}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
          it.checked ? "border-transit bg-transit text-white" : "border-line bg-white"
        }`}
      >
        {it.checked && "✓"}
      </button>
      <span className={`flex-1 text-sm ${it.checked ? "text-muted line-through" : "text-ink"}`}>{it.name}</span>
      <button className="shrink-0 text-xs text-torii" onClick={() => onRemove(it.id)}>삭제</button>
    </div>
  );
}
