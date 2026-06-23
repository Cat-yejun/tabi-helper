import { NextRequest, NextResponse } from "next/server";
import { anthropic, MODEL, joinText } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

type Msg = { role: "user" | "assistant"; content: string };

// 여행 비서: 대화 히스토리를 받아 다음 답변 생성
export async function POST(req: NextRequest) {
  try {
    const { messages, city } = (await req.json()) as { messages: Msg[]; city?: string };
    if (!messages?.length)
      return NextResponse.json({ error: "messages 가 필요합니다" }, { status: 400 });

    const sys =
      "너는 일본 여행 중인 한국인 여행자를 돕는 친절한 현지 비서야. " +
      `현재 여행지: ${city || "일본(삿포로 추정)"}. ` +
      "교통, 맛집, 관광, 예절, 일본어 표현, 환율·결제, 응급 상황 등 무엇이든 실용적으로 답해. " +
      "답은 한국어로, 모바일 채팅에서 읽기 쉽게 간결하게. 필요하면 짧은 일본어 표현과 발음을 함께 줘. " +
      "서식은 최소화해: 표(table)·큰 제목(#)·코드블록은 쓰지 말고, 꼭 필요할 때만 - 목록이나 **굵게**를 가볍게 써. " +
      "확실하지 않은 최신 정보(운영시간·요금)는 추정임을 밝히고 현장 확인을 권해.";

    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: sys,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    return NextResponse.json({ reply: joinText(res.content) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "응답 실패" }, { status: 500 });
  }
}
