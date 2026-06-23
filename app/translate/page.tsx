"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, uploadPhoto } from "@/lib/supabase";
import { fileToResizedDataUrl, dataUrlToFile } from "@/lib/image";
import type { Translation } from "@/lib/types";
import { Header, Spinner } from "@/components/ui";
import InAppCamera from "@/components/InAppCamera";

type Result = { original: string; reading: string; translation: string; explanation: string };
type TopMode = "photo" | "live" | "voice";
type LiveSub = "auto" | "tap";
type Box = { x: number; y: number; w: number; h: number; translation: string };

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

function Bubble({ result, compact, hidden }: { result: Result; compact?: boolean; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div className="relative max-h-[45vh] overflow-y-auto rounded-2xl bg-white/95 p-3 shadow-lift backdrop-blur">
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
  const [viewing, setViewing] = useState<Translation | null>(null);

  async function loadHistory() {
    const { data } = await supabase
      .from("translations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) setHistory(data as Translation[]);
  }
  useEffect(() => { loadHistory(); }, []);

  return (
    <>
      <Header title="번역" subtitle="사진 · 실시간 · 음성" />

      <div className="p-4">
        <div className="mb-4 flex gap-2">
          {([
            ["photo", "📷 사진"],
            ["live", "🎥 실시간"],
            ["voice", "🎙️ 음성"],
          ] as [TopMode, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`chip flex-1 justify-center py-2 ${mode === m ? "bg-ink text-white" : "bg-white text-muted border border-line"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "photo" && <PhotoMode onSaved={loadHistory} />}
        {mode === "live" && <LiveCameraMode onSaved={loadHistory} />}
        {mode === "voice" && <VoiceMode onSaved={loadHistory} />}

        {history.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 px-1 font-round font-bold text-ink">최근 번역</h2>
            <div className="space-y-2">
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setViewing(h)}
                  className="card flex w-full gap-3 p-3 text-left active:scale-[0.99]"
                >
                  {h.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={h.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-line text-lg">
                      🎙️
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm text-muted">{h.original}</p>
                    <p className="truncate font-medium text-ink">{h.translation}</p>
                    {h.replaced_url && <span className="text-[10px] text-transit">🇰🇷 덮어쓴 사진 있음</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {viewing && <HistoryDetail item={viewing} onClose={() => setViewing(null)} />}

      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </>
  );
}

/* ---------------- 최근 번역 다시보기 ---------------- */
function HistoryDetail({ item, onClose }: { item: Translation; onClose: () => void }) {
  const [hideBubble, setHideBubble] = useState(false);
  const [showReplaced, setShowReplaced] = useState(false);
  const hasReplaced = !!item.replaced_url;
  const shownSrc = showReplaced && item.replaced_url ? item.replaced_url : item.image_url;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-paper p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        {item.image_url ? (
          <div className="relative rounded-2xl shadow-soft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shownSrc || item.image_url} alt="" className="w-full rounded-2xl" />
            {!showReplaced && (
              <button
                onClick={() => setHideBubble((h) => !h)}
                className="absolute right-3 top-3 z-20 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white"
              >
                {hideBubble ? "👁️ 보이기" : "🙈 가리기"}
              </button>
            )}
            {!showReplaced && !hideBubble && (
              <div className="absolute inset-x-3 bottom-3 z-10">
                <Bubble result={{ original: item.original || "", reading: "", translation: item.translation || "", explanation: item.explanation || "" }} />
              </div>
            )}
          </div>
        ) : (
          <Bubble result={{ original: item.original || "", reading: "", translation: item.translation || "", explanation: item.explanation || "" }} />
        )}

        {hasReplaced && (
          <button className="btn-ghost mt-3 w-full text-sm" onClick={() => setShowReplaced((s) => !s)}>
            {showReplaced ? "원본 + 말풍선 보기" : "🇰🇷 한국어 덮어쓴 사진 보기"}
          </button>
        )}
        <button className="btn-ghost mt-2 w-full" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

/* ---------------- 사진 모드 (카메라 또는 앨범) ---------------- */
function PhotoMode({ onSaved }: { onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const [showCam, setShowCam] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [hideBubble, setHideBubble] = useState(false);

  // 인페인팅(이미지 내 텍스트 교체) 상태
  const [inpainting, setInpainting] = useState(false);
  const [hasReplaced, setHasReplaced] = useState(false); // 변환을 한 번이라도 만들었는지
  const [showReplaced, setShowReplaced] = useState(false); // 지금 변환본을 보여줄지(토글, 재분석 없음)
  const [boxCount, setBoxCount] = useState(0);
  const [recordId, setRecordId] = useState<string | null>(null); // 저장된 translations 레코드 id
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);

  async function handleImage(dataUrl: string) {
    setResult(null);
    setHasReplaced(false);
    setShowReplaced(false);
    setRecordId(null);
    setImage(dataUrl);
    setLoading(true);
    try {
      const data = await translateDataUrl(dataUrl);
      setResult(data);
      try {
        const url = await uploadPhoto(dataUrlToFile(dataUrl, "translate.jpg"), "translations");
        const { data: rec } = await supabase.from("translations").insert({
          original: data.original, translation: data.translation,
          explanation: data.explanation, image_url: url, source: "photo",
        }).select().single();
        if (rec) setRecordId((rec as any).id);
        onSaved();
      } catch { /* 저장 실패해도 결과는 표시 */ }
    } catch (err: any) {
      alert("번역 실패: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    handleImage(await fileToResizedDataUrl(file, 2000)); // 작은 글자 인식을 위해 더 높은 해상도 유지
  }

  // 이미지 속 일본어를 한국어로 "덮어 그리기" (파파고 스타일, 베스트에포트)
  // 결과는 캔버스에 한 번만 그려서 보관 — 이후 토글은 재분석 없이 캔버스를 그대로 보여줌
  async function replaceTextInImage() {
    if (!image) return;
    setInpainting(true);
    try {
      const res = await fetch("/api/translate/inpaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const boxes = json.data as Box[];
      setBoxCount(boxes.length);

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("이미지 로드 실패"));
        img.src = image;
      });
      const c = canvasRef.current!;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      for (const b of boxes) {
        const x = b.x * c.width, y = b.y * c.height, w = b.w * c.width, h = b.h * c.height;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#14233B";
        const fontSize = Math.max(10, Math.min(h * 0.65, 28));
        ctx.font = `${fontSize}px "Noto Sans KR", sans-serif`;
        ctx.textBaseline = "middle";
        // 너비를 넘으면 폰트를 줄여서 한 줄에 맞춤 (베스트에포트)
        let size = fontSize;
        while (ctx.measureText(b.translation).width > w && size > 8) {
          size -= 1;
          ctx.font = `${size}px "Noto Sans KR", sans-serif`;
        }
        ctx.fillText(b.translation, x + 2, y + h / 2);
      }
      setHasReplaced(true);
      setShowReplaced(true);

      // 변환본을 업로드해서 기록에 저장 (나중에 다시 보기)
      try {
        const replacedDataUrl = c.toDataURL("image/jpeg", 0.85);
        const url = await uploadPhoto(dataUrlToFile(replacedDataUrl, "replaced.jpg"), "translations");
        if (recordId) {
          await supabase.from("translations").update({ replaced_url: url }).eq("id", recordId);
        } else {
          await supabase.from("translations").insert({
            original: result?.original || null, translation: result?.translation || null,
            explanation: result?.explanation || null, image_url: url, replaced_url: url, source: "photo",
          });
        }
        onSavedRef.current?.();
      } catch { /* 저장 실패해도 화면 표시는 유지 */ }
    } catch (e: any) {
      alert("이미지 변환 실패: " + e.message + "\n(인식이 어려운 사진일 수 있어요)");
    } finally {
      setInpainting(false);
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      {showCam && (
        <InAppCamera maxWidth={2000} onClose={() => setShowCam(false)} onCapture={(d) => { setShowCam(false); handleImage(d); }} />
      )}

      {!image && !loading && (
        <div className="card p-6 text-center text-muted">
          <p className="mb-4 text-4xl">あ→가</p>
          <p className="mb-4 text-sm">메뉴판 · 표지판 · 안내문을 인식해요</p>
          <div className="flex gap-2">
            <button className="btn-accent flex-1 text-sm" onClick={() => setShowCam(true)}>📷 사진 촬영</button>
            <button className="btn-ghost flex-1 text-sm" onClick={() => fileRef.current?.click()}>🖼 앨범에서</button>
          </div>
        </div>
      )}

      {image && (
        <div className="relative rounded-2xl shadow-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgElRef}
            src={showReplaced ? canvasRef.current?.toDataURL("image/jpeg", 0.9) || image : image}
            alt="원본"
            className="w-full rounded-2xl"
          />
          <canvas ref={canvasRef} className="hidden" />
          {(loading || inpainting) && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink/40">
              <div className="rounded-xl bg-white px-4 py-3">
                <Spinner label={inpainting ? "이미지 속 글자 바꾸는 중…" : "읽는 중…"} />
              </div>
            </div>
          )}
          {result && !showReplaced && (
            <button
              onClick={() => setHideBubble((h) => !h)}
              className="absolute right-3 top-3 z-20 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white"
            >
              {hideBubble ? "👁️" : "🙈"}
            </button>
          )}
          {result && !showReplaced && (
            <div className="absolute inset-x-3 bottom-3 z-10 animate-[fadeIn_.3s_ease]">
              <Bubble result={result} hidden={hideBubble} />
            </div>
          )}
        </div>
      )}

      {image && !loading && (
        <div className="mt-3 flex gap-2">
          <button className="btn-ghost flex-1 text-sm" onClick={() => { setImage(null); setResult(null); setHasReplaced(false); }}>
            다시 찍기
          </button>
          {!hasReplaced && result && (
            <button className="btn-primary flex-1 text-sm" onClick={replaceTextInImage} disabled={inpainting}>
              🇰🇷 사진 속 글자 바꾸기
            </button>
          )}
          {hasReplaced && (
            <button className="btn-ghost flex-1 text-sm" onClick={() => setShowReplaced((s) => !s)}>
              {showReplaced ? "원본 보기" : "변환본 다시 보기"}
            </button>
          )}
          {hasReplaced && (
            <button className="btn-ghost text-sm" onClick={replaceTextInImage} disabled={inpainting}>
              ↻ 다시 변환
            </button>
          )}
        </div>
      )}
      {result && !hasReplaced && (
        <p className="mt-2 text-center text-xs text-muted">
          ‘사진 속 글자 바꾸기’는 AI가 글자 위치를 추정해 덮어 그리는 기능으로, 정확도가 완벽하지 않을 수 있어요.
        </p>
      )}
      {hasReplaced && (
        <p className="mt-2 text-center text-xs text-muted">
          {boxCount}개 텍스트 블록을 바꿨어요. 작은 글자나 흐린 글자는 인식되지 않을 수 있어요(베스트에포트).
        </p>
      )}
    </>
  );
}

/* ---------------- 실시간 카메라 모드 ---------------- */
function LiveCameraMode({ onSaved }: { onSaved: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const [sub, setSub] = useState<LiveSub>("tap");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [hideBubble, setHideBubble] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setReady(true);
      } catch {
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
      if (data.translation || data.explanation) setResult(data);
    } catch { /* 자동 모드에선 조용히 넘어감 */ } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (sub !== "auto" || !ready) return;
    const id = setInterval(capture, 3000);
    return () => clearInterval(id);
  }, [sub, ready]); // eslint-disable-line

  async function saveCurrent() {
    if (!result || !canvasRef.current) return;
    try {
      const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.7);
      const url = await uploadPhoto(dataUrlToFile(dataUrl, "live.jpg"), "translations");
      await supabase.from("translations").insert({
        original: result.original, translation: result.translation,
        explanation: result.explanation, image_url: url, source: "live",
      });
      onSaved();
      alert("저장했어요");
    } catch (e: any) { alert("저장 실패: " + e.message); }
  }

  if (err) return <p className="rounded-xl bg-torii/10 p-4 text-sm text-torii">{err}</p>;

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <button onClick={() => setSub("tap")} className={`chip flex-1 justify-center py-2 ${sub === "tap" ? "bg-transit text-white" : "bg-white text-muted border border-line"}`}>👆 탭하면 번역</button>
        <button onClick={() => setSub("auto")} className={`chip flex-1 justify-center py-2 ${sub === "auto" ? "bg-transit text-white" : "bg-white text-muted border border-line"}`}>♻︎ 자동 번역</button>
      </div>

      <div className="relative rounded-2xl bg-black shadow-soft">
        <video ref={videoRef} playsInline muted className="w-full rounded-2xl" onClick={() => sub === "tap" && capture()} />
        <canvas ref={canvasRef} className="hidden" />
        {!ready && <div className="absolute inset-0 flex items-center justify-center text-white"><Spinner label="카메라 켜는 중…" /></div>}
        <div className="absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white">
          {busy ? (<><span className="h-2 w-2 animate-pulse rounded-full bg-torii" /> 번역 중</>) : sub === "auto" ? (<><span className="h-2 w-2 rounded-full bg-transit" /> 자동 (3초마다)</>) : (<>화면을 탭하세요</>)}
        </div>
        {result && (
          <button onClick={() => setHideBubble((h) => !h)} className="absolute right-3 top-3 z-20 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white">
            {hideBubble ? "👁️" : "🙈"}
          </button>
        )}
        {result && (
          <div className="absolute inset-x-3 bottom-3 z-10 animate-[fadeIn_.3s_ease]">
            <Bubble result={result} compact hidden={hideBubble} />
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        {sub === "tap" && <button className="btn-primary flex-1" onClick={capture} disabled={busy || !ready}>{busy ? "번역 중…" : "지금 번역"}</button>}
        {result && <button className="btn-ghost flex-1 text-sm" onClick={saveCurrent}>이 번역 저장</button>}
      </div>
      <p className="mt-2 text-center text-xs text-muted">자동 번역은 호출량이 많아 비용이 늘 수 있어요. 평소엔 ‘탭’ 모드를 권장합니다.</p>
    </div>
  );
}

/* ---------------- 실시간 음성 번역 모드 (Google Speech-to-Text) ---------------- */
function VoiceMode({ onSaved }: { onSaved: () => void }) {
  const [listening, setListening] = useState(false);
  const [captions, setCaptions] = useState<{ original: string; translation: string }[]>([]);
  const [err, setErr] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopFlagRef = useRef(false);

  async function recordChunk(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const stream = streamRef.current!;
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => resolve(new Blob(chunks, { type: "audio/webm" }));
      rec.onerror = () => reject(new Error("녹음 오류"));
      recRef.current = rec;
      rec.start();
      setTimeout(() => rec.state !== "inactive" && rec.stop(), 4000); // 4초 청크
    });
  }

  async function loop() {
    while (!stopFlagRef.current) {
      try {
        const blob = await recordChunk();
        const dataUrl: string = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(new Error("오디오 변환 실패"));
          r.readAsDataURL(blob);
        });
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: dataUrl }),
        });
        const json = await res.json();
        if (res.ok && json.data?.original) {
          setCaptions((c) => [...c, json.data].slice(-20));
          supabase.from("translations").insert({
            original: json.data.original, translation: json.data.translation,
            explanation: null, image_url: null, source: "voice",
          }).then(() => onSaved());
        }
      } catch { /* 청크 하나 실패해도 계속 */ }
    }
  }

  async function start() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stopFlagRef.current = false;
      setListening(true);
      loop();
    } catch {
      setErr("마이크를 열 수 없어요. 권한을 허용했는지 확인하세요.");
    }
  }

  function stop() {
    stopFlagRef.current = true;
    recRef.current?.state !== "inactive" && recRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setListening(false);
  }

  useEffect(() => () => stop(), []); // eslint-disable-line

  return (
    <div>
      {err && <p className="mb-3 rounded-xl bg-torii/10 p-3 text-sm text-torii">{err}</p>}
      <div className="card flex flex-col items-center gap-3 p-8">
        <button
          onClick={listening ? stop : start}
          className={`flex h-20 w-20 items-center justify-center rounded-full text-3xl text-white shadow-lift transition ${
            listening ? "bg-torii animate-pulse" : "bg-ink"
          }`}
        >
          🎙️
        </button>
        <p className="text-sm text-muted">{listening ? "듣고 있어요… 다시 눌러서 종료" : "눌러서 실시간 통역 시작"}</p>
      </div>

      <div className="mt-4 space-y-2">
        {captions.slice().reverse().map((c, i) => (
          <div key={i} className="card p-3">
            <p className="text-sm text-muted">{c.original}</p>
            <p className="font-medium text-ink">{c.translation}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted">
        4초 단위로 끊어 인식해요. 정확도를 위해 또박또박 말한 뒤 잠깐 멈춰주세요. (Google Speech-to-Text 사용, 비용이 발생할 수 있어요)
      </p>
    </div>
  );
}
