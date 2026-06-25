import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL, parseDataUrl, extractJson, joinText } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

// 영수증 사진(base64 data URL)을 받아 가계부 항목으로 구조화
export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image) return NextResponse.json({ error: "image 가 필요합니다" }, { status: 400 });

    const { mediaType, data } = parseDataUrl(image);

    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as any, data },
            },
            {
              type: "text",
              text:
                "이 영수증 사진을 분석해 JSON 으로만 답해. 설명·코드펜스 없이 JSON 객체 하나만.\n" +
                "스키마: {store: string, purchase_date: 'YYYY-MM-DD'|null, purchase_time: 'HH:MM'|null, currency: string(JPY 등), " +
                "category: '식비'|'교통'|'쇼핑'|'관광'|'숙박'|'기타', total: number, " +
                "items: [{name: string(한국어로 의역), price: number, qty: number}], note: string}.\n" +
                "영수증에 인쇄된 날짜와 시간을 정확히 읽어서 purchase_date, purchase_time 에 넣어. 시간이 없으면 purchase_time 은 null. " +
                "일본어 품목명은 한국어로 자연스럽게 번역하되 원어를 note 에 덧붙여도 됨. " +
                "읽기 어려우면 최선의 추정값을 넣고 note 에 '추정' 표기. 통화기호 없이 숫자만.",
            },
          ],
        },
      ],
    });

    const parsed = extractJson<Record<string, unknown>>(joinText(res.content));
    return NextResponse.json({ data: parsed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "분석 실패" }, { status: 500 });
  }
}
