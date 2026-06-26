"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { PLAN_CATEGORIES, type Itinerary, type ItineraryItem, type Expense } from "@/lib/types";
import { Header, Spinner, CategoryChip } from "@/components/ui";
import { loadGoogleMaps } from "@/lib/gmaps";

const vehicleKo: Record<string, string> = {
  SUBWAY: "지하철", HEAVY_RAIL: "열차", COMMUTER_TRAIN: "전철", BUS: "버스",
  TRAM: "트램", RAIL: "철도", HIGH_SPEED_TRAIN: "신칸센",
};

// "삿포로역 → 오타루역 (JR 이동)" 같은 이동 항목 정제: 화살표 뒤(도착)만, 괄호 설명 제거
function cleanPlaceName(name: string): string {
  let s = name;
  if (s.includes("→")) s = s.split("→").pop() || s;
  if (s.includes("->")) s = s.split("->").pop() || s;
  s = s.replace(/\([^)]*\)/g, "");
  return s.trim();
}
function placeQuery(x: ItineraryItem): string {
  // 주소는 AI가 잘못 채우는 경우가 많아(장소명과 불일치) 붙이지 않고,
  // 정제된 장소명만 사용 — 구글이 이름으로 더 정확히 지오코딩함
  return cleanPlaceName(x.place);
}

// 두 일정 사이 이동: 도보 거리/시간을 보여주고, 대중교통은 구글 지도 링크로 안내
// (일본 대중교통은 구글 Directions API 미지원이라 앱 내 계산 불가)
function TransitConnector({ from, to }: { from: ItineraryItem; to: ItineraryItem }) {
  const cached = (from as any).transit_cache || null;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState<{ duration?: string; distance?: string } | null>(cached);

  const fromQ = placeQuery(from);
  const toQ = placeQuery(to);
  const gmapsTransit = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(fromQ)}&destination=${encodeURIComponent(toQ)}&travelmode=transit`;

  async function fetchWalking(force = false) {
    if ((info && !force) || loading) return;
    setLoading(true);
    setErr("");
    try {
      const g = await loadGoogleMaps();
      const svc = new g.maps.DirectionsService();
      const { result, status } = await new Promise<{ result: any; status: string }>((resolve) => {
        svc.route(
          { origin: fromQ, destination: toQ, travelMode: g.maps.TravelMode.WALKING },
          (res: any, st: any) => resolve({ result: res, status: String(st) })
        );
      });
      if (status === "OK" && result?.routes?.length) {
        const leg = result.routes[0].legs[0];
        const newInfo = { duration: leg.duration?.text, distance: leg.distance?.text };
        setInfo(newInfo);
        const { error: cacheErr } = await supabase
          .from("itinerary_items").update({ transit_cache: newInfo }).eq("id", from.id);
        if (cacheErr) console.error("이동방법 캐시 저장 실패:", cacheErr.message);
      } else {
        setErr(`도보 경로를 찾지 못했어요 [${status}]`);
      }
    } catch (e: any) {
      console.error(e);
      setErr("경로 확인 중 오류가 발생했어요");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    setOpen((o) => !o);
    if (!open && !info) fetchWalking();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-transit/40 bg-transit/5">
      <button onClick={toggle} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-transit">
        <span className="text-base">🚶</span>
        <span className="flex-1">이동방법 {info ? "" : "보기"}</span>
        {info?.duration && <span className="rounded-full bg-transit px-2 py-0.5 text-[11px] font-bold text-white">도보 {info.duration}</span>}
        <span className="text-transit/60">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="border-t border-transit/20 px-3 py-2.5 text-xs">
          {loading && <Spinner label="도보 경로 확인 중…" />}
          {err && <p className="text-torii">{err}</p>}
          {info && (
            <div className="space-y-1.5">
              <p className="text-muted">🚶 도보 {info.duration}{info.distance ? ` · ${info.distance}` : ""}</p>
              <div className="flex flex-wrap gap-3 pt-0.5">
                <Link className="font-medium text-transit" href={`/map?fromName=${encodeURIComponent(fromQ)}&toName=${encodeURIComponent(toQ)}`}>
                  지도에서 도보 경로 →
                </Link>
                <a className="font-medium text-amber" href={gmapsTransit} target="_blank" rel="noopener noreferrer">
                  🚆 구글 지도에서 대중교통 보기
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ItineraryInner() {
  const params = useSearchParams();
  const [trips, setTrips] = useState<Itinerary[]>([]);
  const [active, setActive] = useState<Itinerary | null>(null);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [showAI, setShowAI] = useState(false);
  const [sharing, setSharing] = useState<{ trip: Itinerary; url: string } | null>(null);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<ItineraryItem> | null>(null);

  async function loadTrips() {
    const { data } = await supabase
      .from("itineraries")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      setTrips(data as Itinerary[]);
      if (!active && data.length) selectTrip(data[0] as Itinerary);
    }
  }
  async function selectTrip(t: Itinerary) {
    setActive(t);
    const { data } = await supabase
      .from("itinerary_items")
      .select("*")
      .eq("itinerary_id", t.id)
      .order("day_date")
      .order("sort_order");
    setItems((data as ItineraryItem[]) || []);
  }
  useEffect(() => {
    loadTrips();
    if (params.get("new") === "1") setShowAI(true);
  }, []); // eslint-disable-line

  async function saveItem() {
    if (!editing || !active) return;
    const payload = {
      itinerary_id: active.id,
      day_date: editing.day_date || active.start_date,
      time: editing.time || null,
      place: editing.place || "",
      address: editing.address || null,
      lat: editing.lat ?? null,
      lng: editing.lng ?? null,
      category: editing.category || "관광",
      note: editing.note || null,
      sort_order: editing.sort_order ?? items.length,
      transit_cache: null, // 장소가 바뀌면 이전 이동 캐시 무효화
    };
    if (editing.id) await supabase.from("itinerary_items").update(payload).eq("id", editing.id);
    else await supabase.from("itinerary_items").insert(payload);
    setEditing(null);
    await selectTrip(active);
  }
  async function removeItem(id: string) {
    if (!confirm("이 일정을 삭제할까요?")) return;
    await supabase.from("itinerary_items").delete().eq("id", id);
    if (active) await selectTrip(active);
  }
  async function removeTrip(t: Itinerary) {
    if (!confirm(`'${t.title}' 전체 일정을 삭제할까요?`)) return;
    await supabase.from("itineraries").delete().eq("id", t.id);
    setActive(null);
    setItems([]);
    await loadTrips();
  }

  // 공유 코드 생성(없으면) 후 링크 시트 표시
  async function shareTrip(t: Itinerary) {
    let code = (t as any).share_code as string | undefined;
    if (!code) {
      code = Math.random().toString(36).slice(2, 10);
      const { error } = await supabase.from("itineraries").update({ share_code: code }).eq("id", t.id);
      if (error) { alert("공유 코드 생성 실패: " + error.message); return; }
      await loadTrips();
    }
    const url = `${window.location.origin}/shared/${code}`;
    setSharing({ trip: t, url });
  }

  // 날짜별 그룹
  const byDay: Record<string, ItineraryItem[]> = {};
  for (const it of items) {
    const k = it.day_date || "미정";
    (byDay[k] ||= []).push(it);
  }
  // 같은 날 안에서는 시간순 정렬 (시간 없는 항목은 맨 뒤, 그 안에선 추가 순서)
  for (const k of Object.keys(byDay)) {
    byDay[k].sort((a, b) => {
      const ta = a.time?.trim() || "";
      const tb = b.time?.trim() || "";
      if (ta && tb) return ta.localeCompare(tb);
      if (ta) return -1;
      if (tb) return 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }
  const days = Object.keys(byDay).sort();

  return (
    <>
      <Header
        title="일정표"
        subtitle={active?.title}
        right={
          <button className="btn-accent text-sm" onClick={() => setShowAI(true)}>
            ✦ AI 일정
          </button>
        }
      />

      <div className="space-y-4 p-4">
        {/* 여행 선택 탭 */}
        {trips.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {trips.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTrip(t)}
                className={`chip shrink-0 ${
                  active?.id === t.id ? "bg-ink text-white" : "bg-white text-muted border border-line"
                }`}
              >
                {t.title}
              </button>
            ))}
          </div>
        )}

        {trips.length === 0 && (
          <div className="card p-8 text-center text-sm text-muted">
            “이틀간 삿포로 핵심 관광지랑 라멘 맛집 위주로” 처럼 말하면<br />AI가 동선까지 짜드려요.
            <button className="btn-accent mt-4 w-full" onClick={() => setShowAI(true)}>
              ✦ AI로 일정 만들기
            </button>
          </div>
        )}

        {/* 타임라인 */}
        {days.map((day) => (
          <section key={day}>
            <h2 className="mb-2 px-1 font-round font-bold text-ink">
              {day}{" "}
              <span className="text-xs font-normal text-muted">{byDay[day].length}곳</span>
            </h2>
            <div className="card p-4">
              {byDay[day].map((it, idx) => {
                const isLast = idx === byDay[day].length - 1;
                const next = byDay[day][idx + 1];
                return (
                  <div key={it.id}>
                    <div className="relative flex gap-3 pb-1">
                      {/* 세로 연결선 (다음 항목이 있을 때만) */}
                      {!isLast && <span className="absolute left-[11px] top-7 bottom-0 w-0.5 bg-transit/25" />}
                      <span className="z-10 mt-0.5 h-6 w-6 shrink-0 rounded-full bg-transit text-center text-xs font-bold leading-6 text-white">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {it.time && <span className="text-sm font-medium text-transit">{it.time}</span>}
                          <CategoryChip value={it.category} />
                        </div>
                        <p className="font-medium text-ink">{it.place}</p>
                        {it.address && <p className="text-xs text-muted">{it.address}</p>}
                        {it.note && <p className="mt-0.5 text-sm text-muted">{it.note}</p>}
                        <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                          <button className="text-transit" onClick={() => setEditing(it)}>수정</button>
                          <Link className="text-transit" href={`/map?toName=${encodeURIComponent(placeQuery(it))}&useMyLocation=1`}>
                            📍 현재 위치에서 길찾기
                          </Link>
                          <button className="text-torii" onClick={() => removeItem(it.id)}>삭제</button>
                        </div>
                      </div>
                    </div>

                    {/* 점선(연결선) 자리에 다음 장소까지 이동 안내 */}
                    {!isLast && next && (
                      <div className="relative flex gap-3 pb-1">
                        <span className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-transit/25" />
                        <span className="w-6 shrink-0" />
                        <div className="min-w-0 flex-1 py-1">
                          <TransitConnector from={it} to={next} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {active && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                className="btn-ghost flex-1 text-sm"
                onClick={() => setEditing({ day_date: active.start_date, category: "관광" })}
              >
                + 일정 추가
              </button>
              <button className="btn-ghost flex-1 text-sm text-transit" onClick={() => shareTrip(active)}>
                🔗 공유
              </button>
              <button className="btn-ghost flex-1 text-sm text-amber" onClick={() => setDiaryOpen(true)}>
                📔 기록
              </button>
              <button className="btn-ghost text-sm text-torii" onClick={() => removeTrip(active)}>
                삭제
              </button>
            </div>
          </div>
        )}
      </div>

      {sharing && (
        <ShareSheet itinerary={sharing.trip} url={sharing.url} onClose={() => setSharing(null)} />
      )}

      {diaryOpen && active && (
        <DiarySheet trip={active} items={items} onClose={() => setDiaryOpen(false)} />
      )}

      {showAI && (
        <AISheet
          onClose={() => setShowAI(false)}
          onDone={async (tripId) => {
            setShowAI(false);
            await loadTrips();
            const { data } = await supabase.from("itineraries").select("*").eq("id", tripId).single();
            if (data) selectTrip(data as Itinerary);
          }}
        />
      )}

      {editing && (
        <ItemSheet
          item={editing}
          days={active ? [active.start_date, active.end_date].filter(Boolean) as string[] : []}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={saveItem}
        />
      )}
    </>
  );
}

function AISheet({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [tab, setTab] = useState<"text" | "pdf">("text");
  const [prompt, setPrompt] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [city, setCity] = useState("삿포로");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(false);

  // 공통: AI 응답(plan)을 받아 DB에 일정표+항목으로 저장
  async function savePlan(plan: any) {
    const { data: trip, error } = await supabase
      .from("itineraries")
      .insert({
        title: plan.title || `${city} 여행`,
        start_date: plan.start_date || start || null,
        end_date: plan.end_date || end || null,
      })
      .select()
      .single();
    if (error) throw error;

    // 소유자를 팀 멤버(owner)로 등록
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("trip_members").insert({ itinerary_id: trip.id, user_id: user.id, role: "owner" });
    }

    const rows: any[] = [];
    (plan.days || []).forEach((d: any) => {
      (d.items || []).forEach((it: any, i: number) => {
        rows.push({
          itinerary_id: trip.id,
          day_date: d.date || null,
          time: it.time || null,
          place: it.place || "",
          address: it.address || null,
          lat: typeof it.lat === "number" ? it.lat : null,
          lng: typeof it.lng === "number" ? it.lng : null,
          category: it.category || "관광",
          note: it.note || null,
          sort_order: i,
        });
      });
    });
    if (rows.length) await supabase.from("itinerary_items").insert(rows);
    onDone(trip.id);
  }

  async function generateFromText() {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, city, startDate: start, endDate: end }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await savePlan(json.data);
    } catch (err: any) {
      alert("생성 실패: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateFromPdf() {
    if (!pdfFile) return;
    setLoading(true);
    try {
      const pdfDataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("PDF 를 읽지 못했습니다"));
        r.readAsDataURL(pdfFile);
      });
      const res = await fetch("/api/itinerary/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf: pdfDataUrl, city, startDate: start, endDate: end }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await savePlan(json.data);
    } catch (err: any) {
      alert("PDF 분석 실패: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = tab === "text" ? !!prompt.trim() : !!pdfFile;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/40">
      <div className="w-full max-w-md rounded-t-3xl bg-paper p-4">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <h2 className="mb-1 font-round text-lg font-bold">AI 일정 만들기</h2>

        <div className="my-3 flex gap-2">
          <button
            onClick={() => setTab("text")}
            className={`chip flex-1 justify-center py-2 ${tab === "text" ? "bg-ink text-white" : "bg-white text-muted border border-line"}`}
          >
            ✏️ 텍스트로 설명
          </button>
          <button
            onClick={() => setTab("pdf")}
            className={`chip flex-1 justify-center py-2 ${tab === "pdf" ? "bg-ink text-white" : "bg-white text-muted border border-line"}`}
          >
            📄 PDF 업로드
          </button>
        </div>

        {tab === "text" ? (
          <>
            <p className="mb-2 text-sm text-muted">가고 싶은 곳·분위기·기간을 자유롭게 적어보세요.</p>
            <textarea
              className="field"
              rows={4}
              placeholder="예) 첫날은 오타루 운하랑 오르골당, 둘째날은 삿포로 시내 맥주박물관이랑 라멘요코초. 너무 빡빡하지 않게."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </>
        ) : (
          <>
            <p className="mb-2 text-sm text-muted">
              미리 만든 일정표·예약 확인서 PDF를 올리면 AI가 읽고 동선까지 짜드려요.
            </p>
            <label className="card flex flex-col items-center gap-1 p-6 text-center text-sm text-muted">
              <span className="text-2xl">📄</span>
              {pdfFile ? (
                <span className="font-medium text-ink">{pdfFile.name}</span>
              ) : (
                <span>PDF 파일 선택</span>
              )}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              />
            </label>
          </>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <input className="field" placeholder="도시" value={city} onChange={(e) => setCity(e.target.value)} />
          <input type="date" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="date" className="field" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose} disabled={loading}>
            취소
          </button>
          <button
            className="btn-accent flex-1"
            onClick={tab === "text" ? generateFromText : generateFromPdf}
            disabled={loading || !canSubmit}
          >
            {loading ? "만드는 중…" : "✦ 일정 생성"}
          </button>
        </div>
        {loading && (
          <div className="mt-3">
            <Spinner label="동선을 짜는 중… (10~30초)" />
          </div>
        )}
      </div>
    </div>
  );
}

function ItemSheet({
  item,
  days,
  onChange,
  onClose,
  onSave,
}: {
  item: Partial<ItineraryItem>;
  days: string[];
  onChange: (i: Partial<ItineraryItem>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const up = (p: Partial<ItineraryItem>) => onChange({ ...item, ...p });
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/40">
      <div className="w-full max-w-md rounded-t-3xl bg-paper p-4">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <h2 className="mb-3 font-round text-lg font-bold">{item.id ? "일정 수정" : "일정 추가"}</h2>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted">장소</span>
            <input className="field mt-1" value={item.place || ""} onChange={(e) => up({ place: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-muted">날짜</span>
              <input type="date" className="field mt-1" value={item.day_date || ""} onChange={(e) => up({ day_date: e.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="text-muted">시간</span>
              <input className="field mt-1" placeholder="10:30" value={item.time || ""} onChange={(e) => up({ time: e.target.value })} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-muted">분류</span>
            <select className="field mt-1" value={item.category || "관광"} onChange={(e) => up({ category: e.target.value })}>
              {PLAN_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted">주소</span>
            <input className="field mt-1" value={item.address || ""} onChange={(e) => up({ address: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="text-muted">메모</span>
            <textarea className="field mt-1" rows={2} value={item.note || ""} onChange={(e) => up({ note: e.target.value })} />
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>취소</button>
          <button className="btn-primary flex-1" onClick={onSave} disabled={!item.place}>저장</button>
        </div>
      </div>
    </div>
  );
}

// 여행 기록(일기) 생성/보기 시트
function DiarySheet({ trip, items, onClose }: { trip: Itinerary; items: ItineraryItem[]; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [entries, setEntries] = useState<{ date: string; title: string; diary: string }[] | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // 일정 + 가계부를 날짜별·시간순으로 묶기
  async function buildMaterial() {
    // 이 여행에 연결된 가계부 + (없으면) 같은 기간 개인 가계부
    const { data: exp } = await supabase
      .from("expenses")
      .select("*")
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
      (dayMap[d] ||= []).push({
        time: e.purchase_time || null,
        kind: "지출",
        text: `${e.store || "가게"}에서 ${itemsTxt || e.category || "지출"} (¥${Math.round(e.total || 0).toLocaleString()})`,
      });
    }
    const days = Object.keys(dayMap).sort().map((date) => ({
      date,
      entries: dayMap[date].sort((a, b) => (a.time || "99").localeCompare(b.time || "99")),
    }));
    return days;
  }

  async function generate() {
    setLoading(true);
    setErr("");
    try {
      const days = await buildMaterial();
      if (!days.length) { setErr("기록할 일정이 없어요."); setLoading(false); return; }
      const res = await fetch("/api/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const totalSpent = expenses.reduce((s, e) => s + (e.total || 0), 0);

  async function saveImage() {
    const el = document.getElementById("diary-capture");
    if (!el) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(el, { backgroundColor: "#F1F3F6", scale: 2 });
      const link = document.createElement("a");
      link.download = `${trip.title}_여행기록.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      alert("이미지 저장에 실패했어요. 스크린샷으로 대신 저장해 주세요.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/40" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-paper p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />

        {!entries ? (
          <div className="text-center">
            <p className="text-4xl">📔</p>
            <h2 className="mt-2 font-round text-lg font-bold">여행 기록 만들기</h2>
            <p className="mt-1 mb-4 text-sm text-muted">
              일정과 가계부(영수증 시간 포함)를 바탕으로 AI가 하루하루를 감성 일기로 써줘요.
            </p>
            {err && <p className="mb-2 text-sm text-torii">{err}</p>}
            <button className="btn-primary w-full" onClick={generate} disabled={loading}>
              {loading ? "일기 쓰는 중…" : "✨ 여행 일기 생성"}
            </button>
            <button className="btn-ghost mt-2 w-full" onClick={onClose}>닫기</button>
          </div>
        ) : (
          <>
            <div id="diary-capture" className="rounded-2xl bg-paper p-4">
              <div className="mb-4 text-center">
                <p className="font-round text-3xl font-extrabold text-ink">旅</p>
                <h1 className="mt-1 font-round text-xl font-extrabold text-ink">{trip.title}</h1>
                {trip.start_date && (
                  <p className="text-xs text-muted">{trip.start_date} ~ {trip.end_date || trip.start_date}</p>
                )}
                {totalSpent > 0 && (
                  <p className="mt-1 text-xs text-torii">총 지출 ¥{Math.round(totalSpent).toLocaleString()}</p>
                )}
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
              <button className="btn-ghost w-full text-sm" onClick={generate} disabled={loading}>
                {loading ? "다시 쓰는 중…" : "↻ 다시 생성"}
              </button>
              <button className="btn-ghost w-full" onClick={onClose}>닫기</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ShareSheet({ itinerary, url, onClose }: { itinerary: Itinerary; url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [members, setMembers] = useState<{ user_id: string; role: string; username: string }[]>([]);
  const [nickname, setNickname] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState("");

  async function loadMembers() {
    const { data: rows } = await supabase
      .from("trip_members").select("user_id, role").eq("itinerary_id", itinerary.id);
    if (!rows) return;
    const ids = rows.map((r: any) => r.user_id);
    const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
    const nameById: Record<string, string> = {};
    (profs || []).forEach((p: any) => { nameById[p.id] = p.username; });
    setMembers(rows.map((r: any) => ({ ...r, username: nameById[r.user_id] || "(이름 없음)" })));
  }
  useEffect(() => { loadMembers(); }, []); // eslint-disable-line

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  async function addMember() {
    const name = nickname.trim();
    if (!name) return;
    setAdding(true);
    setMsg("");
    try {
      // 닉네임으로 사용자 찾기
      const { data: prof } = await supabase.from("profiles").select("id, username").ilike("username", name).maybeSingle();
      if (!prof) { setMsg("그런 아이디를 가진 사용자가 없어요."); setAdding(false); return; }
      const { error } = await supabase.from("trip_members")
        .insert({ itinerary_id: itinerary.id, user_id: (prof as any).id, role: "member" });
      if (error) {
        setMsg(error.message.includes("duplicate") ? "이미 추가된 멤버예요." : "추가 실패: " + error.message);
      } else {
        setNickname("");
        setMsg(`'${(prof as any).username}' 님을 추가했어요.`);
        loadMembers();
      }
    } finally {
      setAdding(false);
    }
  }

  async function removeMember(uid: string) {
    await supabase.from("trip_members").delete().eq("itinerary_id", itinerary.id).eq("user_id", uid);
    loadMembers();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/40" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-paper p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <h2 className="mb-1 font-round text-lg font-bold">👥 함께 여행하기</h2>
        <p className="mb-3 text-sm text-muted">
          멤버로 추가된 사람은 ‘{itinerary.title}’의 일정과 가계부를 <b>함께 수정·추가</b>할 수 있어요.
        </p>

        {/* 멤버 추가 */}
        <div className="flex items-center gap-2">
          <input
            className="field flex-1"
            placeholder="추가할 사람의 아이디"
            autoCapitalize="none"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMember()}
          />
          <button className="btn-primary shrink-0 text-sm" onClick={addMember} disabled={adding || !nickname.trim()}>
            추가
          </button>
        </div>
        {msg && <p className="mt-2 text-xs text-transit">{msg}</p>}

        {/* 멤버 목록 */}
        <div className="mt-3 space-y-2">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-2 rounded-xl border border-line bg-white p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
                {m.username[0]?.toUpperCase()}
              </div>
              <span className="flex-1 truncate text-sm font-medium text-ink">{m.username}</span>
              {m.role === "owner" ? (
                <span className="chip bg-amber/15 text-amber">소유자</span>
              ) : (
                <button className="text-xs text-torii" onClick={() => removeMember(m.user_id)}>내보내기</button>
              )}
            </div>
          ))}
        </div>

        {/* 읽기 전용 공유 링크 */}
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-sm font-medium text-ink">🔗 읽기 전용 링크</p>
          <p className="mb-2 text-xs text-muted">로그인 없이 일정만 볼 수 있는 링크예요(수정 불가).</p>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-white p-2">
            <input className="min-w-0 flex-1 bg-transparent px-1 text-sm text-ink outline-none" readOnly value={url} />
            <button className="btn-ghost shrink-0 px-3 py-1.5 text-xs" onClick={copy}>{copied ? "복사됨!" : "복사"}</button>
          </div>
        </div>

        <button className="btn-ghost mt-4 w-full" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

export default function ItineraryPage() {
  return (
    <Suspense fallback={<Header title="일정표" />}>
      <ItineraryInner />
    </Suspense>
  );
}
