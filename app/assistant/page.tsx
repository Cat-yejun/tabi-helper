"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ChatMessage, Conversation } from "@/lib/types";
import { Header } from "@/components/ui";
import Markdown from "@/components/Markdown";
import { fileToResizedDataUrl } from "@/lib/image";

const SUGGESTIONS = [
  "삿포로역에서 오타루 가는 법",
  "근처 라멘 맛집 추천해줘",
  "편의점에서 쓸 일본어 알려줘",
  "지금 환율이면 1만엔이 얼마야?",
];

export default function AssistantPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPendingImage(await fileToResizedDataUrl(file, 1280));
    } catch {
      alert("이미지를 불러오지 못했어요.");
    }
  }
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .order("updated_at", { ascending: false });
    if (data) {
      setConversations(data as Conversation[]);
      // 활성 대화가 없으면 가장 최근 대화를 자동 선택
      if (!activeId && data.length) selectConversation((data[0] as Conversation).id);
    }
  }
  useEffect(() => { loadConversations(); }, []); // eslint-disable-line

  async function selectConversation(id: string) {
    setActiveId(id);
    setDrawer(false);
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    setMessages((data as ChatMessage[]) || []);
  }

  function newConversation() {
    setActiveId(null);
    setMessages([]);
    setDrawer(false);
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string, image?: string | null) {
    const content = text.trim();
    if ((!content && !image) || loading) return;
    setInput("");
    setLoading(true);

    let convId = activeId;
    try {
      if (!convId) {
        const title = (content || "사진 질문").length > 24 ? (content || "사진 질문").slice(0, 24) + "…" : (content || "사진 질문");
        const { data, error } = await supabase
          .from("conversations")
          .insert({ title })
          .select()
          .single();
        if (error) throw error;
        convId = (data as Conversation).id;
        setActiveId(convId);
      }

      const userMsg: ChatMessage = { role: "user", content: content || "이 사진에 대해 설명해줘.", image: image || null };
      const next = [...messages, userMsg];
      setMessages(next);
      // DB엔 텍스트만 저장(이미지 용량 큼). 사진 첨부 표시만 남김
      await supabase.from("chat_messages").insert({
        role: "user",
        content: (image ? "📷 (사진) " : "") + (content || "이 사진에 대해 설명해줘."),
        conversation_id: convId,
      });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content, image: m.image || null })),
          city: "삿포로",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const reply: ChatMessage = { role: "assistant", content: json.reply };
      setMessages([...next, reply]);
      await supabase.from("chat_messages").insert({ role: "assistant", content: json.reply, conversation_id: convId });
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
      loadConversations();
    } catch (err: any) {
      setMessages((m) => [...m, { role: "assistant", content: "죄송해요, 답변을 가져오지 못했어요. (" + err.message + ")" }]);
    } finally {
      setLoading(false);
    }
  }

  async function deleteConversation(id: string) {
    if (!confirm("이 대화를 삭제할까요?")) return;
    await supabase.from("conversations").delete().eq("id", id);
    if (activeId === id) newConversation();
    loadConversations();
  }

  return (
    <div className="flex h-screen flex-col">
      <Header
        title="여행 비서"
        subtitle={activeId ? conversations.find((c) => c.id === activeId)?.title : "새 대화"}
        right={
          <div className="flex items-center gap-3">
            <button className="text-xs text-transit" onClick={newConversation}>+ 새 대화</button>
            <button className="text-xs text-muted" onClick={() => setDrawer(true)}>대화목록</button>
          </div>
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
                m.role === "user" ? "whitespace-pre-wrap bg-ink text-white" : "border border-line bg-white text-ink"
              }`}
            >
              {m.role === "user" && m.image && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={m.image} alt="첨부" className="mb-1.5 max-h-48 rounded-lg object-cover" />
              )}
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
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingImage} alt="첨부" className="h-16 w-16 rounded-lg object-cover" />
            <button className="text-xs text-torii" onClick={() => setPendingImage(null)}>첨부 취소</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
          <button
            className="btn-ghost shrink-0 px-3"
            onClick={() => imgRef.current?.click()}
            disabled={loading}
            title="사진 첨부"
          >
            📷
          </button>
          <textarea
            className="field max-h-28 flex-1 resize-none"
            rows={1}
            placeholder={pendingImage ? "사진에 대해 물어보세요…" : "메시지 입력…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const img = pendingImage;
                setPendingImage(null);
                send(input, img);
              }
            }}
          />
          <button
            className="btn-primary px-4"
            onClick={() => { const img = pendingImage; setPendingImage(null); send(input, img); }}
            disabled={loading || (!input.trim() && !pendingImage)}
          >
            전송
          </button>
        </div>
      </div>

      {/* 대화 목록 드로어 */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex bg-ink/40" onClick={() => setDrawer(false)}>
          <div className="ml-auto flex h-full w-72 max-w-[80%] flex-col bg-paper p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-round text-lg font-bold">대화 목록</h2>
              <button className="text-sm text-muted" onClick={() => setDrawer(false)}>닫기</button>
            </div>
            <button className="btn-accent mb-3 w-full text-sm" onClick={newConversation}>+ 새 대화 시작</button>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {conversations.length === 0 && <p className="text-sm text-muted">아직 대화가 없어요.</p>}
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 rounded-xl border p-3 ${
                    activeId === c.id ? "border-transit bg-white" : "border-line bg-white"
                  }`}
                >
                  <button className="min-w-0 flex-1 text-left" onClick={() => selectConversation(c.id)}>
                    <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                    <p className="text-xs text-muted">
                      {c.updated_at && new Date(c.updated_at).toLocaleDateString("ko-KR")}
                    </p>
                  </button>
                  <button className="shrink-0 text-xs text-torii" onClick={() => deleteConversation(c.id)}>
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
