"use client";

let promise: Promise<typeof google> | null = null;

// 구글맵 JS API 를 한 번만 로드 (한국어/일본 지역)
export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject("SSR");
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (promise) return promise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  promise = new Promise((resolve, reject) => {
    if (!key) return reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 미설정"));
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&language=ko&region=JP`;
    s.async = true;
    s.onload = () => resolve((window as any).google);
    s.onerror = () => reject(new Error("구글맵 로드 실패"));
    document.head.appendChild(s);
  });
  return promise;
}
