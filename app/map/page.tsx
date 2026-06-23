"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadGoogleMaps } from "@/lib/gmaps";
import { Header, Spinner } from "@/components/ui";

type Mode = "TRANSIT" | "WALKING" | "DRIVING";
const modeLabel: Record<Mode, string> = { TRANSIT: "🚆 대중교통", WALKING: "🚶 도보", DRIVING: "🚗 자동차" };
const vehicleKo: Record<string, string> = {
  SUBWAY: "지하철", HEAVY_RAIL: "열차", COMMUTER_TRAIN: "전철", BUS: "버스",
  TRAM: "트램", RAIL: "철도", HIGH_SPEED_TRAIN: "신칸센",
};

type Step = {
  mode: string;
  text: string;
  distance?: string;
  duration?: string;
  transit?: {
    line?: string; vehicle?: string; from?: string; to?: string;
    numStops?: number; departure?: string; arrival?: string; headsign?: string;
  } | null;
};

function MapInner() {
  const params = useSearchParams();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const renderer = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [mode, setMode] = useState<Mode>("TRANSIT");
  const [steps, setSteps] = useState<Step[]>([]);
  const [summary, setSummary] = useState<{ duration?: string; distance?: string; fare?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // 지도 초기화 + 쿼리 파라미터로 도착지 받기
  useEffect(() => {
    const to = params.get("to");
    const name = params.get("name");
    if (to) setDestination(name ? `${name}` : to);

    loadGoogleMaps()
      .then((g) => {
        mapObj.current = new g.maps.Map(mapRef.current!, {
          center: { lat: 43.0618, lng: 141.3545 }, // 삿포로역
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
        });
        renderer.current = new g.maps.DirectionsRenderer({ map: mapObj.current });
        setReady(true);
      })
      .catch((e) => setErr(e.message));
  }, []); // eslint-disable-line

  function useMyLocation() {
    if (!navigator.geolocation) return setErr("위치 권한을 사용할 수 없습니다");
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin(`${pos.coords.latitude},${pos.coords.longitude}`),
      () => setErr("현재 위치를 가져오지 못했습니다"),
      { enableHighAccuracy: true }
    );
  }

  async function route() {
    setErr("");
    if (!destination.trim()) return setErr("도착지를 입력하세요");
    setLoading(true);
    try {
      const g = await loadGoogleMaps();
      const svc = new g.maps.DirectionsService();
      const orig = origin.trim() || "현재 위치 미지정";
      const req: any = {
        origin: origin.trim() || mapObj.current.getCenter(),
        destination: destination.trim(),
        travelMode: g.maps.TravelMode[mode],
      };
      if (mode === "TRANSIT") req.transitOptions = { modes: ["SUBWAY", "TRAIN", "BUS", "RAIL"] };

      const result = await svc.route(req);
      renderer.current.setDirections(result);
      const leg = result.routes[0].legs[0];
      setSummary({
        duration: leg.duration?.text,
        distance: leg.distance?.text,
        fare: (result.routes[0] as any).fare?.text,
      });
      setSteps(
        (leg.steps || []).map((s: any) => ({
          mode: s.travel_mode,
          text: (s.instructions || "").replace(/<[^>]+>/g, ""),
          distance: s.distance?.text,
          duration: s.duration?.text,
          transit: s.transit
            ? {
                line: s.transit.line?.short_name || s.transit.line?.name,
                vehicle: s.transit.line?.vehicle?.type,
                from: s.transit.departure_stop?.name,
                to: s.transit.arrival_stop?.name,
                numStops: s.transit.num_stops,
                departure: s.transit.departure_time?.text,
                arrival: s.transit.arrival_time?.text,
                headsign: s.transit.headsign,
              }
            : null,
        }))
      );
    } catch (e: any) {
      setErr(mode === "TRANSIT" ? "대중교통 경로를 찾지 못했어요. 도보/자동차로 바꿔보세요." : "경로를 찾지 못했습니다.");
      setSteps([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header title="길찾기" subtitle="대중교통 · 도보 · 자동차" />

      <div ref={mapRef} className="h-56 w-full bg-line" />

      <div className="space-y-3 p-4">
        {!ready && !err && <Spinner label="지도 불러오는 중…" />}
        {err && <p className="rounded-xl bg-torii/10 p-3 text-sm text-torii">{err}</p>}

        <div className="card space-y-2 p-3">
          <div className="flex items-center gap-2">
            <span className="w-12 text-xs text-muted">출발</span>
            <input className="field" placeholder="출발지 (비우면 현재 지도 중심)" value={origin} onChange={(e) => setOrigin(e.target.value)} />
            <button className="btn-ghost shrink-0 px-3 text-xs" onClick={useMyLocation}>📍</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 text-xs text-muted">도착</span>
            <input className="field" placeholder="도착지 (예: 札幌駅, 오타루 운하)" value={destination} onChange={(e) => setDestination(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          {(["TRANSIT", "WALKING", "DRIVING"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`chip flex-1 justify-center py-2 ${
                mode === m ? "bg-transit text-white" : "bg-white text-muted border border-line"
              }`}
            >
              {modeLabel[m]}
            </button>
          ))}
        </div>

        <button className="btn-primary w-full" onClick={route} disabled={loading || !ready}>
          {loading ? "경로 찾는 중…" : "길찾기"}
        </button>

        {summary && (
          <div className="card flex items-center justify-around p-3 text-center">
            <div>
              <p className="text-xs text-muted">소요</p>
              <p className="font-round font-bold text-ink">{summary.duration}</p>
            </div>
            <div>
              <p className="text-xs text-muted">거리</p>
              <p className="font-round font-bold text-ink">{summary.distance}</p>
            </div>
            {summary.fare && (
              <div>
                <p className="text-xs text-muted">요금</p>
                <p className="font-round font-bold text-ink">{summary.fare}</p>
              </div>
            )}
          </div>
        )}

        {steps.map((s, i) => (
          <div key={i} className="card p-3">
            {s.transit ? (
              <div>
                <div className="flex items-center gap-2">
                  <span className="chip bg-transit/10 text-transit">
                    {vehicleKo[s.transit.vehicle || ""] || "대중교통"}
                  </span>
                  <span className="font-medium text-ink">{s.transit.line}</span>
                  {s.transit.headsign && <span className="text-xs text-muted">{s.transit.headsign} 방면</span>}
                </div>
                <p className="mt-1 text-sm text-ink">
                  <b>{s.transit.from}</b> 승차 → <b>{s.transit.to}</b> 하차
                  {s.transit.numStops ? ` (${s.transit.numStops}정거장)` : ""}
                </p>
                <p className="text-xs text-muted">
                  {s.transit.departure} 출발 · {s.transit.arrival} 도착 · {s.duration}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-lg">{s.mode === "WALKING" ? "🚶" : "🚗"}</span>
                <div className="flex-1">
                  <p className="text-sm text-ink">{s.text}</p>
                  <p className="text-xs text-muted">{s.distance} · {s.duration}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<Header title="길찾기" />}>
      <MapInner />
    </Suspense>
  );
}
