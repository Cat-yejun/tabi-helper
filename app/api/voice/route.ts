import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL, joinText } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

// 짧은 오디오 청크(일본어)를 받아 Google Speech-to-Text 로 받아쓰고, Claude 로 한국어 번역
export async function POST(req: NextRequest) {
  try {
    const { audio } = await req.json(); // data URL (audio/webm;codecs=opus)
    if (!audio) return NextResponse.json({ error: "audio 가 필요합니다" }, { status: 400 });

    const key = process.env.GOOGLE_SPEECH_API_KEY;
    if (!key) return NextResponse.json({ error: "GOOGLE_SPEECH_API_KEY 미설정" }, { status: 500 });

    const m = audio.match(/^data:(.+?);base64,(.*)$/);
    if (!m) return NextResponse.json({ error: "오디오 형식이 올바르지 않습니다" }, { status: 400 });
    const b64 = m[2];

    // Google Cloud Speech-to-Text: 동기 인식 (짧은 오디오, 1분 이내에 적합)
    const sttRes = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            encoding: "WEBM_OPUS",
            languageCode: "ja-JP",
            enableAutomaticPunctuation: true,
          },
          audio: { content: b64 },
        }),
      }
    );
    const sttJson = await sttRes.json();
    if (!sttRes.ok) {
      return NextResponse.json({ error: sttJson.error?.message || "음성 인식 실패" }, { status: 500 });
    }

    const original = (sttJson.results || [])
      .map((r: any) => r.alternatives?.[0]?.transcript || "")
      .join(" ")
      .trim();
    if (!original) return NextResponse.json({ data: { original: "", translation: "" } });

    // 한국어 번역
    const tRes = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `다음 일본어 문장을 자연스러운 한국어로만 번역해. 부가 설명 없이 번역문만:\n${original}`,
        },
      ],
    });
    const translation = joinText(tRes.content).trim();

    return NextResponse.json({ data: { original, translation } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "처리 실패" }, { status: 500 });
  }
}
