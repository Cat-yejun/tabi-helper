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

  // 현재 위치를 Promise 로 가져오기
  function getCurrentPos(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("위치 사용 불가"));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(`${pos.coords.latitude},${pos.coords.longitude}`),
        () => reject(new Error("현재 위치를 가져오지 못했습니다")),
        { enableHighAccuracy: true }
      );
    });
  }

  // 일정 항목 이름 정제: "삿포로역 → 오타루역 (JR 이동)" 처럼 이동을 나타내는 항목 처리
  // 화살표가 있으면 마지막(도착) 부분만, 괄호 보충설명은 제거
  function cleanPlace(name: string): string {
    let s = name;
    if (s.includes("→")) s = s.split("→").pop() || s; // 도착지만
    if (s.includes("->")) s = s.split("->").pop() || s;
    s = s.replace(/\([^)]*\)/g, ""); // 괄호 설명 제거
    return s.trim();
  }

  // 지도 초기화 + 쿼리 파라미터(일정 연계) 처리
  useEffect(() => {
    // 좌표(to/from) 또는 장소이름(toName/fromName) 중 들어온 값을 사용. 이름이 더 정확.
    const toRaw = params.get("toName") || params.get("to") || "";
    const fromRaw = params.get("fromName") || params.get("from") || "";
    // 이름 파라미터는 정제, 좌표는 그대로
    const to = params.get("toName") ? cleanPlace(toRaw) : toRaw;
    const from = params.get("fromName") ? cleanPlace(fromRaw) : fromRaw;
    const useMine = params.get("useMyLocation") === "1"; // 현재 위치 출발

    if (to) setDestination(to);
    if (from) setOrigin(from);

    loadGoogleMaps()
      .then(async (g) => {
        mapObj.current = new g.maps.Map(mapRef.current!, {
          center: { lat: 43.0618, lng: 141.3545 }, // 삿포로역
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
        });
        renderer.current = new g.maps.DirectionsRenderer({ map: mapObj.current });
        setReady(true);

        // 일정에서 넘어온 경우 자동으로 길찾기 실행
        if (to) {
          let originVal = from || "";
          if (useMine && !from) {
            try {
              originVal = await getCurrentPos();
              setOrigin(originVal);
            } catch { /* 실패 시 사용자가 직접 입력 */ }
          }
          runRoute(originVal, to, "TRANSIT");
        }
      })
      .catch((e) => setErr(e.message));
  }, []); // eslint-disable-line

  async function useMyLocation() {
    try {
      setOrigin(await getCurrentPos());
    } catch (e: any) {
      setErr(e.message);
    }
  }

  function route() {
    runRoute(origin, destination, mode);
  }

  // 실제 경로 계산 (명시적 값을 받아 자동/수동 모두 처리)
  async function runRoute(originVal: string, destVal: string, modeVal: Mode) {
    setErr("");
    if (!destVal.trim()) return setErr("도착지를 입력하세요");
    setMode(modeVal);
    setLoading(true);
    try {
      const g = await loadGoogleMaps();
      const svc = new g.maps.DirectionsService();
      const origin = originVal.trim() || mapObj.current.getCenter();
      const req: any = {
        origin,
        destination: destVal.trim(),
        travelMode: g.maps.TravelMode[modeVal],
        region: "jp",
      };
      // 대중교통은 "지금" 기준 출발 시각을 명시 (없으면 0건 나오는 경우 방지)
      if (modeVal === "TRANSIT") {
        req.transitOptions = { departureTime: new Date() };
      }

      // 콜백 방식으로 status 를 정확히 읽음 (Promise 거부에 의존하지 않음)
      const { result, status } = await new Promise<{ result: any; status: string }>((resolve) => {
        svc.route(req, (res: any, st: any) => resolve({ result: res, status: String(st) }));
      });

      if (status !== "OK" || !result?.routes?.length) {
        // 대중교통이 0건이면 안내만 하고 자동 전환하지 않음(원인 파악 위해)
        if (status === "ZERO_RESULTS" && modeVal === "TRANSIT") {
          setErr("이 시간대·구간에 대중교통 경로가 없어요. 도보/자동차 버튼을 눌러보세요. [ZERO_RESULTS]");
        } else {
          const messages: Record<string, string> = {
            ZERO_RESULTS: "이 두 지점 사이의 경로를 찾지 못했어요.",
            OVER_QUERY_LIMIT: "API 호출 한도를 초과했어요. Google Cloud 콘솔에서 일일 할당량/결제 상태를 확인해주세요.",
            REQUEST_DENIED: "API 설정 문제예요. 결제 계정 연결과 키의 API 제한사항을 확인해주세요.",
            INVALID_REQUEST: "출발지/도착지 형식을 확인해주세요. (출발지가 비어있을 수 있어요)",
            NOT_FOUND: "입력한 장소를 찾을 수 없어요. 더 구체적으로 입력해보세요.",
          };
          setErr((messages[status] || "경로를 찾지 못했어요.") + ` [${status}]`);
        }
        setSteps([]);
        setSummary(null);
        return;
      }

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
      console.error("Directions error:", e);
      setErr("길찾기 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
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
              onClick={() => {
                setMode(m);
                if (destination.trim()) runRoute(origin, destination, m);
              }}
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

        {destination.trim() && (
          <a
            className="btn-ghost block w-full text-center text-sm"
            href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin.trim() || "")}&destination=${encodeURIComponent(destination.trim())}&travelmode=${mode.toLowerCase()}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            🗺️ 구글 지도 앱에서 열기
          </a>
        )}

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
