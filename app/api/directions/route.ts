import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// 구글 Directions API 프록시. 서버 키를 숨기고 대중교통/도보/자동차 경로 반환.
export async function POST(req: NextRequest) {
  try {
    const { origin, destination, mode } = await req.json();
    if (!origin || !destination)
      return NextResponse.json({ error: "origin, destination 필요" }, { status: 400 });

    const key = process.env.GOOGLE_MAPS_SERVER_KEY;
    if (!key)
      return NextResponse.json({ error: "GOOGLE_MAPS_SERVER_KEY 미설정" }, { status: 500 });

    const travelMode = (mode || "transit") as "transit" | "walking" | "driving";
    const params = new URLSearchParams({
      origin,
      destination,
      mode: travelMode,
      language: "ko",
      region: "jp",
      key,
    });
    if (travelMode === "transit") params.set("transit_mode", "rail|subway|bus|train");

    const r = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?${params}`
    );
    const json = await r.json();

    if (json.status !== "OK") {
      return NextResponse.json(
        { error: json.error_message || json.status || "경로를 찾지 못했습니다" },
        { status: 400 }
      );
    }

    // 첫 경로만 사람이 읽기 쉽게 요약
    const route = json.routes[0];
    const leg = route.legs[0];
    const steps = (leg.steps || []).map((s: any) => ({
      mode: s.travel_mode, // WALKING | TRANSIT
      instruction: s.html_instructions?.replace(/<[^>]+>/g, "") || "",
      distance: s.distance?.text,
      duration: s.duration?.text,
      transit: s.transit_details
        ? {
            line: s.transit_details.line?.short_name || s.transit_details.line?.name,
            vehicle: s.transit_details.line?.vehicle?.name, // 지하철/버스/기차
            from: s.transit_details.departure_stop?.name,
            to: s.transit_details.arrival_stop?.name,
            numStops: s.transit_details.num_stops,
            departure: s.transit_details.departure_time?.text,
            arrival: s.transit_details.arrival_time?.text,
            headsign: s.transit_details.headsign,
          }
        : null,
    }));

    return NextResponse.json({
      summary: {
        distance: leg.distance?.text,
        duration: leg.duration?.text,
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        fare: route.fare?.text || null,
      },
      steps,
      overviewPolyline: route.overview_polyline?.points || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "길찾기 실패" }, { status: 500 });
  }
}
