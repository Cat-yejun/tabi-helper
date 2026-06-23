"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, uploadPhoto } from "@/lib/supabase";
import { fileToResizedDataUrl, dataUrlToFile } from "@/lib/image";
import type { Translation } from "@/lib/types";
import { Header, Spinner } from "@/components/ui";

type Result = { original: string; reading: string; translation: string; explanation: string };
type TopMode = "photo" | "live";
type LiveMode = "auto" | "tap";

async function translateDataUrl(dataUrl: string): Promise<Result> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json.data as Result;
}

function Bubble({ result, compact }: { result: Result; compact?: boolean }) {
  return (
    <div className="relative rounded-2xl bg-white/95 p-3 shadow-lift backdrop-blur">
      <span className="absolute -top-2 left-6 h-4 w-4 rotate-45 bg-white/95" />
      {result.original && (
        <p className="font-round text-base font-bold text-ink">
          {result.original}
          {result.reading && <span className="ml-2 text-xs font-normal text-muted">[{result.reading}]</span>}
        </p>
      )}
      {result.translation && <p className="mt-1 text-lg font-semibold text-torii">{result.translation}</p>}
      {result.explanation && (
        <p className={`mt-1.5 text-sm leading-relaxed text-muted ${compact ? "line-clamp-2" : ""}`}>
          {result.explanation}
        </p>
      )}
    </div>
  );
}

export default function TranslatePage() {
  const [mode, setMode] = useState<TopMode>("photo");
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

  return (
    <>
      <Header title="번역" subtitle="사진 속 일본어를 읽어드려요" />

      <div className="p-4">
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setMode("photo")}
            className={`chip flex-1 justify-center py-2 ${mode === "photo" ? "bg-ink text-white" : "bg-white text-muted border border-line"}`}
          >
            📷 사진
          </button>
          <button
            onClick={() => setMode("live")}
            className={`chip flex-1 justify-center py-2 ${mode === "live" ? "bg-ink text-white" : "bg-white text-muted border border-line"}`}
          >
            🎥 실시간
          </button>
        </div>

        {mode === "photo" ? (
          <PhotoMode onSaved={loadHistory} />
        ) : (
          <LiveMode onSaved={loadHistory} />
        )}

        {history.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 px-1 font-round font-bold text-ink">최근 번역</h2>
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="card flex gap-3 p-3">
                  {h.image_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
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
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </>
  );
}

/* ---------------- 사진 모드 (카메라 또는 앨범) ---------------- */
function PhotoMode({ onSaved }: { onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setResult(null);
    setLoading(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setImage(dataUrl);
      const data = await translateDataUrl(dataUrl);
      setResult(data);
      try {
        const url = await uploadPhoto(dataUrlToFile(dataUrl, "translate.jpg"), "translations");
        await supabase.from("translations").insert({
          original: data.original,
          translation: data.translation,
          explanation: data.explanation,
          image_url: url,
        });
        onSaved();
      } catch { /* 저장 실패해도 결과는 표시 */ }
    } catch (err: any) {
      alert("번역 실패: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      {!image && !loading && (
        <button
          className="card flex w-full flex-col items-center gap-2 p-10 text-muted"
          onClick={() => fileRef.current?.click()}
        >
          <span className="text-4xl">あ→가</span>
          <span className="text-sm">사진을 찍거나 앨범에서 골라보세요</span>
          <span className="text-xs text-line">메뉴판 · 표지판 · 안내문</span>
        </button>
      )}

      {image && (
        <div className="relative overflow-hidden rounded-2xl shadow-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="원본" className="w-full" />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink/40">
              <div className="rounded-xl bg-white px-4 py-3"><Spinner label="읽는 중…" /></div>
            </div>
          )}
          {result && (
            <div className="absolute inset-x-3 bottom-3 animate-[fadeIn_.3s_ease]">
              <Bubble result={result} />
            </div>
          )}
        </div>
      )}

      {image && !loading && (
        <button className="btn-ghost mt-3 w-full text-sm" onClick={() => fileRef.current?.click()}>
          다른 사진 선택
        </button>
      )}
    </>
  );
}

/* ---------------- 실시간 모드 (카메라 스트림) ---------------- */
function LiveMode({ onSaved }: { onSaved: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const [liveMode, setLiveMode] = useState<LiveMode>("tap");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  // 카메라 시작/정지
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch (e: any) {
        setErr("카메라를 열 수 없어요. 권한을 허용했는지 확인하세요. (HTTPS 또는 localhost 필요)");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  async function capture() {
    if (busyRef.current || !videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    if (!v.videoWidth) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const maxW = 1280;
      const scale = Math.min(1, maxW / v.videoWidth);
      const c = canvasRef.current;
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", 0.7);
      const data = await translateDataUrl(dataUrl);
      // 글자를 못 찾으면(번역 빈 값) 무시
      if (data.translation || data.explanation) setResult(data);
    } catch {
      /* 자동 모드에선 조용히 넘어감 */
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // 자동 모드: 3초마다 캡처
  useEffect(() => {
    if (liveMode !== "auto" || !ready) return;
    const id = setInterval(capture, 3000);
    return () => clearInterval(id);
  }, [liveMode, ready]); // eslint-disable-line

  async function saveCurrent() {
    if (!result || !canvasRef.current) return;
    try {
      const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.7);
      const url = await uploadPhoto(dataUrlToFile(dataUrl, "live.jpg"), "translations");
      await supabase.from("translations").insert({
        original: result.original,
        translation: result.translation,
        explanation: result.explanation,
        image_url: url,
      });
      onSaved();
      alert("저장했어요");
    } catch (e: any) {
      alert("저장 실패: " + e.message);
    }
  }

  if (err) {
    return <p className="rounded-xl bg-torii/10 p-4 text-sm text-torii">{err}</p>;
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setLiveMode("tap")}
          className={`chip flex-1 justify-center py-2 ${liveMode === "tap" ? "bg-transit text-white" : "bg-white text-muted border border-line"}`}
        >
          👆 탭하면 번역
        </button>
        <button
          onClick={() => setLiveMode("auto")}
          className={`chip flex-1 justify-center py-2 ${liveMode === "auto" ? "bg-transit text-white" : "bg-white text-muted border border-line"}`}
        >
          ♻︎ 자동 번역
        </button>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-black shadow-soft">
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full"
          onClick={() => liveMode === "tap" && capture()}
        />
        <canvas ref={canvasRef} className="hidden" />

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Spinner label="카메라 켜는 중…" />
          </div>
        )}

        {/* 상태 배지 */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white">
          {busy ? (
            <><span className="h-2 w-2 animate-pulse rounded-full bg-torii" /> 번역 중</>
          ) : liveMode === "auto" ? (
            <><span className="h-2 w-2 rounded-full bg-transit" /> 자동 (3초마다)</>
          ) : (
            <>화면을 탭하세요</>
          )}
        </div>

        {result && (
          <div className="absolute inset-x-3 bottom-3 animate-[fadeIn_.3s_ease]">
            <Bubble result={result} compact />
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        {liveMode === "tap" && (
          <button className="btn-primary flex-1" onClick={capture} disabled={busy || !ready}>
            {busy ? "번역 중…" : "지금 번역"}
          </button>
        )}
        {result && (
          <button className="btn-ghost flex-1 text-sm" onClick={saveCurrent}>
            이 번역 저장
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-muted">
        실시간 번역은 호출량이 많아 비용이 늘 수 있어요. 평소엔 ‘탭’ 모드를 권장합니다.
      </p>
    </div>
  );
}
