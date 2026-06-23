import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL, parseDataUrl, extractJson, joinText } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

// 사진 속 일본어(또는 외국어)를 인식 → 번역 + 설명
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
            { type: "image", source: { type: "base64", media_type: mediaType as any, data } },
            {
              type: "text",
              text:
                "사진 속 글자(주로 일본어)를 읽어 JSON 으로만 답해. 설명·코드펜스 없이 JSON 객체 하나.\n" +
                "스키마: {original: string(사진 속 원문 그대로, 줄바꿈 유지), " +
                "reading: string(후리가나/로마자 발음, 없으면 ''), " +
                "translation: string(자연스러운 한국어 번역), " +
                "explanation: string(이게 뭔지/맥락/주의할 점을 한국어 2~3문장으로. 메뉴판이면 음식 설명, " +
                "표지판이면 무슨 안내인지, 주의문이면 무슨 뜻인지)}.\n" +
                "글자가 없으면 사진 속 사물이 무엇인지 explanation 에 설명하고 나머지는 빈 문자열.",
            },
          ],
        },
      ],
    });

    const parsed = extractJson<Record<string, unknown>>(joinText(res.content));
    return NextResponse.json({ data: parsed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "번역 실패" }, { status: 500 });
  }
}
