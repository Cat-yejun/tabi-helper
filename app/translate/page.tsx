"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, uploadPhoto } from "@/lib/supabase";
import { fileToResizedDataUrl, dataUrlToFile } from "@/lib/image";
import type { Translation } from "@/lib/types";
import { Header, Spinner } from "@/components/ui";

type Result = { original: string; reading: string; translation: string; explanation: string };

export default function TranslatePage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Translation[]>([]);

  async function loadHistory() {
    const { data } = await supabase
      .from("translations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setHistory(data as Translation[]);
  }
  useEffect(() => {
    loadHistory();
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setResult(null);
    setLoading(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setImage(dataUrl);
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResult(json.data);

      // 기록 저장 (이미지 업로드 후)
      try {
        const url = await uploadPhoto(dataUrlToFile(dataUrl, "translate.jpg"), "translations");
        await supabase.from("translations").insert({
          original: json.data.original,
          translation: json.data.translation,
          explanation: json.data.explanation,
          image_url: url,
        });
        loadHistory();
      } catch {
        /* 업로드 실패해도 결과는 표시 */
      }
    } catch (err: any) {
      alert("번역 실패: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header
        title="번역"
        subtitle="사진 속 일본어를 읽어드려요"
        right={
          <button className="btn-accent text-sm" onClick={() => fileRef.current?.click()}>
            📷 촬영
          </button>
        }
      />
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />

      <div className="space-y-4 p-4">
        {!image && !loading && (
          <button
            className="card flex w-full flex-col items-center gap-2 p-10 text-muted"
            onClick={() => fileRef.current?.click()}
          >
            <span className="text-4xl">あ→가</span>
            <span className="text-sm">메뉴판·표지판·안내문을 찍어보세요</span>
          </button>
        )}

        {image && (
          <div className="relative overflow-hidden rounded-2xl shadow-soft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="원본" className="w-full" />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-ink/40">
                <div className="rounded-xl bg-white px-4 py-3">
                  <Spinner label="읽는 중…" />
                </div>
              </div>
            )}
            {result && (
              // 말풍선 오버레이
              <div className="absolute inset-x-3 bottom-3 animate-[fadeIn_.3s_ease]">
                <div className="relative rounded-2xl bg-white/97 p-3 shadow-lift backdrop-blur">
                  <span className="absolute -top-2 left-6 h-4 w-4 rotate-45 bg-white/97" />
                  {result.original && (
                    <p className="font-round text-base font-bold text-ink">
                      {result.original}
                      {result.reading && <span className="ml-2 text-xs font-normal text-muted">[{result.reading}]</span>}
                    </p>
                  )}
                  {result.translation && (
                    <p className="mt-1 text-lg font-semibold text-torii">{result.translation}</p>
                  )}
                  {result.explanation && (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{result.explanation}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {image && !loading && (
          <button className="btn-ghost w-full text-sm" onClick={() => fileRef.current?.click()}>
            다른 사진 찍기
          </button>
        )}

        {/* 기록 */}
        {history.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 font-round font-bold text-ink">최근 번역</h2>
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="card flex gap-3 p-3">
                  {h.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm text-muted">{h.original}</p>
                    <p className="truncate font-medium text-ink">{h.translation}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
