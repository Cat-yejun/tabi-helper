"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ChatMessage } from "@/lib/types";
import { Header } from "@/components/ui";
import Markdown from "@/components/Markdown";

const SUGGESTIONS = [
  "삿포로역에서 오타루 가는 법",
  "근처 라멘 맛집 추천해줘",
  "편의점에서 쓸 일본어 알려줘",
  "지금 환율이면 1만엔이 얼마야?",
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      // 최근 100개를 가져온 뒤 시간순(오래된→최신)으로 뒤집어 표시
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) setMessages((data as ChatMessage[]).reverse());
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    setInput("");
    const userMsg: ChatMessage = { role: "user", content };
    const next = [...messages, userMsg];
    setMessages(next);
    setLoading(true);
    supabase.from("chat_messages").insert({ role: "user", content });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          city: "삿포로",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const reply: ChatMessage = { role: "assistant", content: json.reply };
      setMessages([...next, reply]);
      supabase.from("chat_messages").insert({ role: "assistant", content: json.reply });
    } catch (err: any) {
      setMessages([...next, { role: "assistant", content: "죄송해요, 답변을 가져오지 못했어요. (" + err.message + ")" }]);
    } finally {
      setLoading(false);
    }
  }

  async function clearAll() {
    if (!confirm("대화 기록을 모두 지울까요?")) return;
    await supabase.from("chat_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setMessages([]);
  }

  return (
    <div className="flex h-screen flex-col">
      <Header
        title="여행 비서"
        subtitle="무엇이든 물어보세요"
        right={
          messages.length > 0 ? (
            <button className="text-xs text-muted" onClick={clearAll}>기록 지우기</button>
          ) : undefined
        }
      />

      <div className="flex-1 space-y-3 overflow-y-auto p-4 pb-2">
        {messages.length === 0 && (
          <div className="space-y-2">
            <div className="card p-4 text-sm text-muted">
              안녕하세요! 교통·맛집·일본어·환율 등 여행 중 궁금한 걸 편하게 물어보세요.
            </div>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn-ghost w-full text-left text-sm" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "whitespace-pre-wrap bg-ink text-white"
                  : "border border-line bg-white text-ink"
              }`}
            >
              {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-line bg-white px-4 py-3">
              <span className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:-0.2s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:-0.1s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted" />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-16 border-t border-line bg-paper p-3">
        <div className="flex items-end gap-2">
          <textarea
            className="field max-h-28 flex-1 resize-none"
            rows={1}
            placeholder="메시지 입력…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <button className="btn-primary px-4" onClick={() => send(input)} disabled={loading || !input.trim()}>
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
