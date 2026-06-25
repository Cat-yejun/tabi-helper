"use client";

import { useEffect, useRef, useState } from "react";

// 네이티브 카메라 앱을 띄우지 않고 브라우저 안에서 바로 촬영 → 셔터음 없음
// (한국/일본 단말기는 법규상 네이티브 카메라 앱 셔터음을 끌 수 없어, 이 방식으로 우회)
export default function InAppCamera({
  onCapture,
  onClose,
  maxWidth = 1600,
}: {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
  maxWidth?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        // 기기가 광학/디지털 줌을 지원하면 슬라이더 범위 설정
        const caps: any = track.getCapabilities?.() || {};
        if (caps.zoom) {
          setZoomRange({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 });
          setZoom(caps.zoom.min || 1);
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch {
        setErr("카메라를 열 수 없어요. 브라우저 권한을 허용했는지 확인하세요.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function shoot() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    const maxW = maxWidth;
    const scale = Math.min(1, maxW / v.videoWidth);
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    onCapture(c.toDataURL("image/jpeg", 0.85));
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="relative flex-1">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        {!ready && !err && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            카메라 켜는 중…
          </div>
        )}
        {err && (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-white">
            {err}
          </div>
        )}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-black/50 px-3 py-1.5 text-sm text-white"
        >
          취소
        </button>
        <span className="absolute left-4 top-4 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white">
          📷 사진 촬영
        </span>
        {zoomRange && (
          <div className="absolute inset-x-8 bottom-4 flex items-center gap-2 rounded-full bg-black/50 px-4 py-2">
            <span className="text-xs text-white">🔍</span>
            <input
              type="range"
              min={zoomRange.min}
              max={zoomRange.max}
              step={zoomRange.step}
              value={zoom}
              onChange={(e) => {
                const z = Number(e.target.value);
                setZoom(z);
                trackRef.current?.applyConstraints?.({ advanced: [{ zoom: z } as any] }).catch(() => {});
              }}
              className="flex-1 accent-white"
            />
            <span className="w-9 text-right text-xs text-white">{zoom.toFixed(1)}×</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center bg-black py-6">
        <button
          onClick={shoot}
          disabled={!ready}
          className="h-16 w-16 rounded-full border-4 border-white bg-white/20 disabled:opacity-30"
        />
      </div>
    </div>
  );
}
