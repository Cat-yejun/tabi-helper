"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, uploadPhoto } from "@/lib/supabase";
import { fileToResizedDataUrl, dataUrlToFile } from "@/lib/image";
import type { Itinerary, ItineraryItem, Expense, JournalEntry } from "@/lib/types";
import { Header, Spinner } from "@/components/ui";

type Mode = "menu" | "photo" | "diary";

export default function JournalPage() {
  const [trips, setTrips] = useState<Itinerary[]>([]);
  const [active, setActive] = useState<Itinerary | null>(null);
  const [mode, setMode] = useState<Mode>("menu");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("itineraries").select("*").order("start_date", { ascending: false });
      const ts = (data as Itinerary[]) || [];
      setTrips(ts);
      if (ts.length) setActive(ts[0]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner label="불러오는 중…" /></div>;

  return (
    <>
      <Header title="여행 기록" subtitle="사진·일기로 추억 남기기" />
      <div className="space-y-4 p-4">
        {trips.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted">먼저 일정을 만들면 여기서 기록을 남길 수 있어요.</div>
        ) : (
          <>
            {/* 여행 선택 */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {trips.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setActive(t); setMode("menu"); }}
                  className={`chip shrink-0 ${active?.id === t.id ? "bg-ink text-white" : "bg-white text-muted border border-line"}`}
                >
                  {t.title}
                </button>
              ))}
            </div>

            {active && mode === "menu" && (
              <div className="space-y-2">
                <button className="btn-accent w-full" onClick={() => setMode("photo")}>
                  📸 포토 타임라인
                  <span className="block text-xs font-normal opacity-80">사진과 글을 자유롭게 추가하는 기록지</span>
                </button>
                <button className="btn-primary w-full" onClick={() => setMode("diary")}>
                  ✍️ AI 감성 일기
                  <span className="block text-xs font-normal opacity-80">일정·가계부로 하루를 일기처럼</span>
                </button>
              </div>
            )}

            {active && mode === "photo" && <PhotoTimeline trip={active} onBack={() => setMode("menu")} />}
            {active && mode === "diary" && <AIDiary trip={active} onBack={() => setMode("menu")} />}
          </>
        )}
      </div>
    </>
  );
}

/* ============== 포토 타임라인 (자유 추가/삭제, 저장됨) ============== */
function PhotoTimeline({ trip, onBack }: { trip: Itinerary; onBack: () => void }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function load() {
    const { data } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("itinerary_id", trip.id)
      .order("entry_date")
      .order("entry_time")
      .order("sort_order");
    setEntries((data as JournalEntry[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [trip.id]); // eslint-disable-line

  // 일정에서 장소 가져와 빈 기록으로 초기 생성 (처음 1회 도우미)
  async function seedFromItinerary() {
    const { data } = await supabase
      .from("itinerary_items").select("*").eq("itinerary_id", trip.id).order("day_date").order("sort_order");
    const items = (data as ItineraryItem[]) || [];
    if (!items.length) { alert("일정에 장소가 없어요."); return; }
    const rows = items.map((it, i) => ({
      itinerary_id: trip.id, entry_date: it.day_date, entry_time: it.time,
      place: it.place, caption: "", sort_order: i,
    }));
    const { data: ins } = await supabase.from("journal_entries").insert(rows).select();
    if (ins) setEntries((ins as JournalEntry[]));
  }

  async function addBlank() {
    const { data } = await supabase
      .from("journal_entries")
      .insert({ itinerary_id: trip.id, entry_date: trip.start_date, caption: "", sort_order: entries.length })
      .select().single();
    if (data) setEntries((arr) => [...arr, data as JournalEntry]);
  }

  async function patch(id: string, f: Partial<JournalEntry>) {
    setEntries((arr) => arr.map((x) => (x.id === id ? { ...x, ...f } : x)));
    await supabase.from("journal_entries").update(f).eq("id", id);
  }

  async function remove(id: string) {
    setEntries((arr) => arr.filter((x) => x.id !== id));
    await supabase.from("journal_entries").delete().eq("id", id);
  }

  async function uploadFor(e: JournalEntry, file: File) {
    setBusyId(e.id);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 1280);
      const url = await uploadPhoto(dataUrlToFile(dataUrl, "journal.jpg"), "journal");
      let caption = e.caption || "";
      if (!caption) {
        try {
          const res = await fetch("/api/place-caption", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: dataUrl, place: e.place }),
          });
          const j = await res.json();
          if (res.ok) caption = j.caption || "";
        } catch {}
      }
      await patch(e.id, { photo_url: url, caption });
    } catch (err: any) {
      alert("사진 업로드 실패: " + err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function saveImage() {
    const el = document.getElementById("journal-capture");
    if (!el) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(el, { backgroundColor: "#F1F3F6", scale: 2, useCORS: true });
      const link = document.createElement("a");
      link.download = `${trip.title}_여행기록.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      alert("이미지 저장에 실패했어요. 스크린샷으로 대신 저장해 주세요.");
    }
  }

  if (loading) return <Spinner label="기록 불러오는 중…" />;

  const withContent = entries.filter((e) => e.photo_url || e.caption);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button className="text-sm text-muted" onClick={onBack}>← 뒤로</button>
        <h2 className="font-round font-bold">📸 포토 타임라인</h2>
        <span className="w-8" />
      </div>

      {entries.length === 0 ? (
        <div className="card p-6 text-center text-sm text-muted">
          <p className="mb-4">사진과 글로 여행을 기록해보세요.</p>
          <button className="btn-primary mb-2 w-full" onClick={seedFromItinerary}>일정 장소로 시작하기</button>
          <button className="btn-ghost w-full" onClick={addBlank}>빈 기록 추가</button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {entries.map((e) => (
              <div key={e.id} className="card p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    className="field w-24 py-1 text-xs"
                    type="date"
                    value={e.entry_date || ""}
                    onChange={(ev) => patch(e.id, { entry_date: ev.target.value })}
                  />
                  <input
                    className="field w-20 py-1 text-xs"
                    type="time"
                    value={e.entry_time || ""}
                    onChange={(ev) => patch(e.id, { entry_time: ev.target.value })}
                  />
                  <button className="ml-auto text-xs text-torii" onClick={() => remove(e.id)}>삭제</button>
                </div>
                <input
                  className="field mb-2 text-sm font-medium"
                  placeholder="장소 이름"
                  value={e.place || ""}
                  onChange={(ev) => patch(e.id, { place: ev.target.value })}
                />
                <input
                  ref={(el) => { fileRefs.current[e.id] = el; }}
                  type="file" accept="image/*" className="hidden"
                  onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) uploadFor(e, f); }}
                />
                {e.photo_url ? (
                  <button onClick={() => fileRefs.current[e.id]?.click()} className="block w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.photo_url} alt="" className="w-full rounded-lg object-cover" />
                  </button>
                ) : (
                  <button
                    className="flex h-24 w-full items-center justify-center rounded-lg border-2 border-dashed border-line text-sm text-muted"
                    onClick={() => fileRefs.current[e.id]?.click()}
                    disabled={busyId === e.id}
                  >
                    {busyId === e.id ? "올리는 중…" : "📷 사진 추가"}
                  </button>
                )}
                <textarea
                  className="field mt-2 min-h-[3rem] resize-none text-sm"
                  placeholder={busyId === e.id ? "AI가 캡션 작성 중…" : "이곳에서의 기록 (사진 올리면 AI가 초안을 써줘요)"}
                  value={e.caption || ""}
                  onChange={(ev) => setEntries((arr) => arr.map((x) => (x.id === e.id ? { ...x, caption: ev.target.value } : x)))}
                  onBlur={(ev) => patch(e.id, { caption: ev.target.value })}
                />
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button className="btn-ghost flex-1 text-sm" onClick={addBlank}>+ 기록 추가</button>
          </div>

          {withContent.length > 0 && (
            <>
              <p className="mt-5 mb-2 text-sm font-medium text-ink">내보내기 미리보기</p>
              <div id="journal-capture" className="rounded-2xl bg-paper p-4">
                <div className="mb-4 text-center">
                  <p className="font-round text-2xl font-extrabold text-ink">旅</p>
                  <h1 className="font-round text-lg font-extrabold text-ink">{trip.title}</h1>
                  {trip.start_date && <p className="text-xs text-muted">{trip.start_date} ~ {trip.end_date || trip.start_date}</p>}
                </div>
                <div className="space-y-4">
                  {withContent.map((e) => (
                    <div key={e.id} className="relative border-l-2 border-torii/30 pl-4">
                      <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-torii" />
                      <p className="text-xs font-medium text-torii">
                        {e.entry_date}{e.entry_time ? ` · ${e.entry_time}` : ""}
                      </p>
                      {e.place && <p className="font-round text-sm font-bold text-ink">{e.place}</p>}
                      {e.photo_url && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={e.photo_url} alt="" className="my-1.5 w-full rounded-xl object-cover" crossOrigin="anonymous" />
                      )}
                      {e.caption && <p className="text-sm leading-relaxed text-ink/80">{e.caption}</p>}
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-center text-[10px] text-muted">旅 Tabi 로 기록한 여행</p>
              </div>
              <button className="btn-primary mt-3 w-full" onClick={saveImage}>🖼 이미지로 저장</button>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ============== AI 감성 일기 ============== */
function AIDiary({ trip, onBack }: { trip: Itinerary; onBack: () => void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [entries, setEntries] = useState<{ date: string; title: string; diary: string }[] | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  async function generate() {
    setLoading(true);
    setErr("");
    try {
      const { data: itemData } = await supabase
        .from("itinerary_items").select("*").eq("itinerary_id", trip.id).order("day_date").order("sort_order");
      const items = (itemData as ItineraryItem[]) || [];
      const { data: exp } = await supabase
        .from("expenses").select("*")
        .or(`itinerary_id.eq.${trip.id}${trip.start_date && trip.end_date ? `,and(purchase_date.gte.${trip.start_date},purchase_date.lte.${trip.end_date})` : ""}`);
      const exps = (exp as Expense[]) || [];
      setExpenses(exps);

      const dayMap: Record<string, { time: string | null; kind: string; text: string }[]> = {};
      for (const it of items) {
        const d = it.day_date || trip.start_date || "미정";
        (dayMap[d] ||= []).push({ time: it.time || null, kind: it.category || "일정", text: `${it.place}${it.note ? ` — ${it.note}` : ""}` });
      }
      for (const e of exps) {
        const d = e.purchase_date || trip.start_date || "미정";
        const itemsTxt = (e.items || []).slice(0, 3).map((i) => i.name).join(", ");
        (dayMap[d] ||= []).push({ time: e.purchase_time || null, kind: "지출", text: `${e.store || "가게"}에서 ${itemsTxt || e.category || "지출"} (¥${Math.round(e.total || 0).toLocaleString()})` });
      }
      const days = Object.keys(dayMap).sort().map((date) => ({
        date, entries: dayMap[date].sort((a, b) => (a.time || "99").localeCompare(b.time || "99")),
      }));
      if (!days.length) { setErr("기록할 일정이 없어요."); setLoading(false); return; }

      const res = await fetch("/api/diary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trip.title, days }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEntries(json.entries);
    } catch (e: any) {
      setErr("일기 생성 실패: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveImage() {
    const el = document.getElementById("diary-capture");
    if (!el) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(el, { backgroundColor: "#F1F3F6", scale: 2 });
      const link = document.createElement("a");
      link.download = `${trip.title}_여행일기.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      alert("이미지 저장에 실패했어요. 스크린샷으로 대신 저장해 주세요.");
    }
  }

  const totalSpent = expenses.reduce((s, e) => s + (e.total || 0), 0);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button className="text-sm text-muted" onClick={onBack}>← 뒤로</button>
        <h2 className="font-round font-bold">✍️ AI 감성 일기</h2>
        <span className="w-8" />
      </div>

      {!entries ? (
        <div className="card p-6 text-center">
          <p className="text-4xl">✍️</p>
          <p className="mt-2 mb-4 text-sm text-muted">일정과 가계부(영수증 시간 포함)를 바탕으로 하루하루를 감성 일기로 써드려요.</p>
          {err && <p className="mb-2 text-sm text-torii">{err}</p>}
          <button className="btn-primary w-full" onClick={generate} disabled={loading}>
            {loading ? "일기 쓰는 중…" : "✨ 여행 일기 생성"}
          </button>
        </div>
      ) : (
        <>
          <div id="diary-capture" className="rounded-2xl bg-paper p-4">
            <div className="mb-4 text-center">
              <p className="font-round text-3xl font-extrabold text-ink">旅</p>
              <h1 className="mt-1 font-round text-xl font-extrabold text-ink">{trip.title}</h1>
              {trip.start_date && <p className="text-xs text-muted">{trip.start_date} ~ {trip.end_date || trip.start_date}</p>}
              {totalSpent > 0 && <p className="mt-1 text-xs text-torii">총 지출 ¥{Math.round(totalSpent).toLocaleString()}</p>}
            </div>
            <div className="space-y-4">
              {entries.map((d, i) => (
                <div key={i} className="relative border-l-2 border-torii/30 pl-4">
                  <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-torii" />
                  <p className="text-xs font-medium text-torii">{d.date}</p>
                  <p className="font-round font-bold text-ink">{d.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{d.diary}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-center text-[10px] text-muted">旅 Tabi 로 기록한 여행</p>
          </div>
          <div className="mt-3 space-y-2">
            <button className="btn-primary w-full" onClick={saveImage}>🖼 이미지로 저장</button>
            <button className="btn-ghost w-full text-sm" onClick={generate} disabled={loading}>{loading ? "다시 쓰는 중…" : "↻ 다시 생성"}</button>
          </div>
        </>
      )}
    </div>
  );
}
