import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL, parseDataUrl, extractJson, joinText } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

// 사진 속 일본어 텍스트 블록의 위치(비율 좌표)와 번역을 함께 반환
// → 클라이언트에서 캔버스로 원문을 가리고 번역문을 그 자리에 그려 "파파고 스타일"로 표시
// 주의: 모델의 좌표 추정은 OCR 전용 모델보다 정확도가 낮을 수 있어 참고용입니다.
export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image) return NextResponse.json({ error: "image 가 필요합니다" }, { status: 400 });
    const { mediaType, data } = parseDataUrl(image);

    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as any, data } },
            {
              type: "text",
              text:
                "사진 속에서 읽을 수 있는 일본어(또는 외국어) 텍스트 블록을 **빠짐없이 모두** 찾아서 JSON 배열로만 답해. " +
                "설명·코드펜스 없이 배열 하나만.\n" +
                "큰 제목뿐 아니라 작은 글자, 메뉴 항목 하나하나, 가격표, 주의문, 라벨 등도 모두 별도 블록으로 포함해. " +
                "흐릿하거나 일부만 보여도 추정해서 포함하고, 정말 읽을 수 없을 때만 제외해.\n" +
                "각 항목 스키마: {x: number, y: number, w: number, h: number, translation: string}.\n" +
                "x,y,w,h 는 이미지 가로/세로 기준 0~1 사이의 비율(좌상단 기준 x,y / 너비,높이). " +
                "translation 은 그 블록의 자연스러운 한국어 번역(짧게, 원문 줄바꿈 유지 안 해도 됨). " +
                "장식적인 배경 패턴이나 로고는 무시해. 텍스트가 전혀 없으면 빈 배열 [] 로 답해.",
            },
          ],
        },
      ],
    });

    const parsed = extractJson<any[]>(joinText(res.content));
    return NextResponse.json({ data: Array.isArray(parsed) ? parsed : [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "분석 실패" }, { status: 500 });
  }
}
