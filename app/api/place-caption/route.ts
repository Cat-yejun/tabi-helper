import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL, joinText, parseDataUrl } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

// 장소 사진(+장소명)을 받아 "거기서 한 일"을 한두 문장으로 요약
export async function POST(req: NextRequest) {
  try {
    const { image, place, note } = await req.json();
    if (!image) return NextResponse.json({ error: "image 가 필요합니다" }, { status: 400 });

    // data URL 또는 http URL 모두 허용
    let mediaType: string, data: string;
    if (image.startsWith("data:")) {
      ({ mediaType, data } = parseDataUrl(image));
    } else {
      const r = await fetch(image);
      mediaType = r.headers.get("content-type") || "image/jpeg";
      data = Buffer.from(await r.arrayBuffer()).toString("base64");
    }

    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as any, data } },
            {
              type: "text",
              text:
                `이 사진은 여행 중 '${place || "어떤 장소"}'${note ? `(${note})` : ""}에서 찍은 거야. ` +
                "사진 속에서 무엇을 하고 무엇을 봤는지 여행 기록지에 들어갈 캡션으로 한국어 1~2문장으로 담백하게 써줘. " +
                "이모지나 따옴표 없이 문장만.",
            },
          ],
        },
      ],
    });
    return NextResponse.json({ caption: joinText(res.content).trim() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "요약 실패" }, { status: 500 });
  }
}
