"use client";

export function Header({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-round text-xl font-extrabold tracking-tight text-ink">
            {title}
          </h1>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-transit border-t-transparent" />
      {label || "처리 중…"}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card mx-4 mt-6 p-8 text-center">
      <p className="font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
      <button className="absolute right-4 top-4 rounded-full bg-white/20 px-3 py-1.5 text-sm text-white">
        닫기
      </button>
    </div>
  );
}

const catColor: Record<string, string> = {
  식비: "bg-torii/10 text-torii",
  식사: "bg-torii/10 text-torii",
  교통: "bg-transit/10 text-transit",
  이동: "bg-transit/10 text-transit",
  쇼핑: "bg-amber/15 text-amber",
  관광: "bg-ink/10 text-ink",
  숙박: "bg-purple-100 text-purple-700",
  기타: "bg-line text-muted",
};

export function CategoryChip({ value }: { value?: string | null }) {
  if (!value) return null;
  return <span className={`chip ${catColor[value] || "bg-line text-muted"}`}>{value}</span>;
}
