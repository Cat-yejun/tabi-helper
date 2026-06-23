"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { PLAN_CATEGORIES, type Itinerary, type ItineraryItem } from "@/lib/types";
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
  const name = cleanPlaceName(x.place);
  return x.address ? `${name} ${x.address}` : name;
}

// 두 일정 사이의 대중교통 이동을 요약해서 보여주는 커넥터 (탭하면 로드, 결과는 캐시)
function TransitConnector({ from, to }: { from: ItineraryItem; to: ItineraryItem }) {
  // from 항목에 저장해둔 캐시가 있으면 바로 사용
  const cached = (from as any).transit_cache || null;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState<{
    mode: "대중교통" | "도보"; duration?: string; fare?: string; lines: { vehicle: string; name: string }[];
  } | null>(cached);

  // 장소 이름(+주소)으로 길찾기 — AI가 추정한 부정확한 좌표 대신 구글 지오코딩에 맡김
  const fromQ = placeQuery(from);
  const toQ = placeQuery(to);

  async function fetchRoute(force = false) {
    if ((info && !force) || loading) return;
    setLoading(true);
    setErr("");
    try {
      const g = await loadGoogleMaps();
      const svc = new g.maps.DirectionsService();

      // 콜백으로 status 를 정확히 읽음
      function routeOnce(mode: "TRANSIT" | "WALKING"): Promise<{ result: any; status: string }> {
        const req: any = { origin: fromQ, destination: toQ, travelMode: g.maps.TravelMode[mode], region: "jp" };
        if (mode === "TRANSIT") req.transitOptions = { departureTime: new Date() };
        return new Promise((resolve) => svc.route(req, (res: any, st: any) => resolve({ result: res, status: String(st) })));
      }

      let { result, status } = await routeOnce("TRANSIT");
      let usedMode: "대중교통" | "도보" = "대중교통";
      if (status === "ZERO_RESULTS") {
        ({ result, status } = await routeOnce("WALKING"));
        usedMode = "도보";
      }
      if (status !== "OK" || !result?.routes?.length) {
        setErr(`경로를 찾지 못했어요 [${status}]`);
        setLoading(false);
        return;
      }

      const leg = result.routes[0].legs[0];
      const lines = (leg.steps || [])
        .filter((s: any) => s.transit)
        .map((s: any) => ({
          vehicle: vehicleKo[s.transit.line?.vehicle?.type || ""] || "대중교통",
          name: s.transit.line?.short_name || s.transit.line?.name || "",
        }));
      const newInfo = {
        mode: usedMode,
        duration: leg.duration?.text,
        fare: (result.routes[0] as any).fare?.text,
        lines,
      };
      setInfo(newInfo);
      // from 항목에 캐시 저장 (다시 들어와도 유지). 실패 시 콘솔에 표시(컬럼 없을 때 등)
      const { error: cacheErr } = await supabase
        .from("itinerary_items").update({ transit_cache: newInfo }).eq("id", from.id);
      if (cacheErr) console.error("이동방법 캐시 저장 실패:", cacheErr.message);
    } catch (e: any) {
      console.error("Directions error:", e);
      setErr("경로 확인 중 오류가 발생했어요");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    setOpen((o) => !o);
    if (!open && !info) fetchRoute();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-transit/40 bg-transit/5">
      <button onClick={toggle} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-transit">
        <span className="text-base">{info?.mode === "도보" ? "🚶" : "🚆"}</span>
        <span className="flex-1">이동방법 {info ? "" : "보기"}</span>
        {info?.duration && <span className="rounded-full bg-transit px-2 py-0.5 text-[11px] font-bold text-white">{info.duration}</span>}
        <span className="text-transit/60">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="border-t border-transit/20 px-3 py-2.5 text-xs">
          {loading && <Spinner label="경로 확인 중…" />}
          {err && <p className="text-torii">{err}</p>}
          {info && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {info.lines.length === 0 ? (
                  <span className="text-muted">{info.mode === "도보" ? "도보 이동" : "환승 없이 도보 구간"}</span>
                ) : (
                  info.lines.map((l, i) => (
                    <span key={i} className="chip bg-transit/15 text-transit">
                      {l.vehicle} {l.name}
                    </span>
                  ))
                )}
              </div>
              <p className="text-muted">
                {info.mode} · 소요 {info.duration}{info.fare ? ` · 요금 ${info.fare}` : ""}
              </p>
              <div className="flex flex-wrap gap-3 pt-0.5">
                <Link
                  className="font-medium text-transit"
                  href={`/map?fromName=${encodeURIComponent(fromQ)}&toName=${encodeURIComponent(toQ)}`}
                >
                  상세 경로 보기 →
                </Link>
                <a
                  className="font-medium text-muted"
                  href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(fromQ)}&destination=${encodeURIComponent(toQ)}&travelmode=transit`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🗺️ 구글 지도에서 열기
                </a>
                <button className="font-medium text-muted" onClick={() => fetchRoute(true)} disabled={loading}>
                  ↻ 다시 조회
                </button>
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

  // 날짜별 그룹
  const byDay: Record<string, ItineraryItem[]> = {};
  for (const it of items) {
    const k = it.day_date || "미정";
    (byDay[k] ||= []).push(it);
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
          <div className="flex gap-2">
            <button
              className="btn-ghost flex-1 text-sm"
              onClick={() => setEditing({ day_date: active.start_date, category: "관광" })}
            >
              + 일정 추가
            </button>
            <button className="btn-ghost text-sm text-torii" onClick={() => removeTrip(active)}>
              여행 삭제
            </button>
          </div>
        )}
      </div>

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

export default function ItineraryPage() {
  return (
    <Suspense fallback={<Header title="일정표" />}>
      <ItineraryInner />
    </Suspense>
  );
}
