import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL, joinText } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

// 일정 + 가계부(영수증 시간 포함)를 받아 날짜별 감성 일기를 생성
export async function POST(req: NextRequest) {
  try {
    const { title, days } = await req.json() as {
      title: string;
      days: { date: string; entries: { time: string | null; kind: string; text: string }[] }[];
    };
    if (!days?.length) return NextResponse.json({ error: "내보낼 일정이 없어요" }, { status: 400 });

    // 모델에 줄 자료: 날짜별 시간순 활동/지출
    const material = days.map((d) => {
      const lines = d.entries
        .map((e) => `- ${e.time || "시간미상"} [${e.kind}] ${e.text}`)
        .join("\n");
      return `## ${d.date}\n${lines}`;
    }).join("\n\n");

    const sys =
      "너는 여행자의 하루 기록(방문 장소·시간, 지출 내역)을 바탕으로 따뜻하고 생생한 여행 일기를 쓰는 작가야. " +
      "한국어로, 1인칭 시점으로, 각 날짜마다 3~5문장의 자연스러운 일기를 써. " +
      "시간 흐름을 살리되 '오전 9시에' 같은 기계적 나열은 피하고, 그날의 분위기와 감정을 담아. " +
      "지출 내역이 있으면 무엇을 먹고 샀는지 자연스럽게 녹이되 금액을 일일이 나열하진 마. " +
      "과장하지 말고 담백하고 다정하게. 출력은 JSON 배열만: " +
      `[{"date":"YYYY-MM-DD","title":"그날을 요약하는 짧은 제목","diary":"일기 본문"}]. 코드펜스 없이 배열만.`;

    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: sys,
      messages: [{ role: "user", content: `여행 제목: ${title}\n\n${material}` }],
    });

    let text = joinText(res.content).trim();
    text = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    let entries: { date: string; title: string; diary: string }[];
    try {
      entries = JSON.parse(text);
    } catch {
      // 파싱 실패 시 통째로 한 편으로
      entries = [{ date: days[0].date, title: title, diary: text }];
    }

    return NextResponse.json({ entries });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "일기 생성 실패" }, { status: 500 });
  }
}
