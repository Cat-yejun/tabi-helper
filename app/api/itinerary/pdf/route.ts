import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL, extractJson, joinText } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

// PDF(여행 일정/예약 확인서 등)를 읽어 구조화된 일정표로 변환
export async function POST(req: NextRequest) {
  try {
    const { pdf, city, startDate, endDate } = await req.json();
    if (!pdf) return NextResponse.json({ error: "pdf 가 필요합니다" }, { status: 400 });

    const m = pdf.match(/^data:(.+?);base64,(.*)$/);
    if (!m) return NextResponse.json({ error: "PDF 형식이 올바르지 않습니다" }, { status: 400 });
    const [, mediaType, data] = m;

    const sys =
      "너는 일본 여행 일정 플래너야. 첨부된 PDF(여행 일정표, 예약 확인서, 패키지 투어 안내문 등)를 읽고 " +
      "실제 동선이 있는 일정표 JSON으로 정리해. PDF에 날짜·시간이 명시되어 있으면 그대로 따르고, " +
      "장소명만 있고 날짜가 없으면 합리적으로 날짜를 배분해. 실제 존재하는 장소의 위도/경도를 최대한 정확히 추정해 채워. 모르면 null.\n" +
      "출력 스키마(JSON 객체 하나만, 설명·코드펜스 금지):\n" +
      "{ title: string, start_date: 'YYYY-MM-DD'|null, end_date: 'YYYY-MM-DD'|null, " +
      "days: [ { date: 'YYYY-MM-DD'|null, items: [ { time: 'HH:MM'|null, place: string, address: string|null, " +
      "lat: number|null, lng: number|null, category: '관광'|'식사'|'이동'|'숙박'|'쇼핑'|'기타', note: string|null } ] } ] }";

    const ctx =
      (city ? `참고 도시: ${city}\n` : "") +
      (startDate ? `참고 시작일: ${startDate}\n` : "") +
      (endDate ? `참고 종료일: ${endDate}\n` : "") +
      "첨부된 PDF 내용을 읽고 위 스키마의 일정표로 정리해줘.";

    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: sys,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: ctx },
          ] as any,
        },
      ],
    });

    const parsed = extractJson<Record<string, unknown>>(joinText(res.content));
    return NextResponse.json({ data: parsed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "PDF 분석 실패" }, { status: 500 });
  }
}
