import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL, extractJson, joinText } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

// 자연어 설명 → 일정표(JSON) 생성. 좌표까지 추정해서 채움.
export async function POST(req: NextRequest) {
  try {
    const { prompt, startDate, endDate, city } = await req.json();
    if (!prompt) return NextResponse.json({ error: "prompt 가 필요합니다" }, { status: 400 });

    const today = new Date().toISOString().slice(0, 10);
    const sys =
      "너는 일본 여행 일정 플래너야. 사용자의 자연어 요청을 받아 현실적인 동선의 일정표를 JSON 으로만 만들어. " +
      "지리적으로 가까운 장소끼리 같은 날에 묶고, 이동 시간을 고려해 하루 3~6개로 구성해. " +
      "실제 존재하는 장소의 위도/경도(lat/lng)를 최대한 정확히 추정해 채워. 모르면 null.\n" +
      "출력 스키마(JSON 객체 하나만, 설명·코드펜스 금지):\n" +
      "{ title: string, start_date: 'YYYY-MM-DD', end_date: 'YYYY-MM-DD', " +
      "days: [ { date: 'YYYY-MM-DD', items: [ { time: 'HH:MM', place: string, address: string, " +
      "lat: number|null, lng: number|null, category: '관광'|'식사'|'이동'|'숙박'|'쇼핑'|'기타', note: string } ] } ] }";

    const ctx =
      `오늘 날짜: ${today}\n` +
      (city ? `여행 도시: ${city}\n` : "여행 도시: 삿포로(없으면 추정)\n") +
      (startDate ? `시작일: ${startDate}\n` : "") +
      (endDate ? `종료일: ${endDate}\n` : "") +
      `요청: ${prompt}`;

    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: sys,
      messages: [{ role: "user", content: ctx }],
    });

    const parsed = extractJson<Record<string, unknown>>(joinText(res.content));
    return NextResponse.json({ data: parsed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "일정 생성 실패" }, { status: 500 });
  }
}
