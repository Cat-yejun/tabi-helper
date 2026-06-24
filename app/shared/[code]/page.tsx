"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Itinerary, ItineraryItem } from "@/lib/types";
import { Header, Spinner, CategoryChip } from "@/components/ui";

export default function SharedItineraryPage({ params }: { params: { code: string } }) {
  const [trip, setTrip] = useState<Itinerary | null>(null);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase
        .from("itineraries")
        .select("*")
        .eq("share_code", params.code)
        .maybeSingle();
      if (!t) { setNotFound(true); setLoading(false); return; }
      setTrip(t as Itinerary);
      const { data: its } = await supabase
        .from("itinerary_items")
        .select("*")
        .eq("itinerary_id", (t as Itinerary).id)
        .order("day_date")
        .order("sort_order");
      setItems((its as ItineraryItem[]) || []);
      setLoading(false);
    })();
  }, [params.code]);

  const byDay: Record<string, ItineraryItem[]> = {};
  for (const it of items) (byDay[it.day_date || "미정"] ||= []).push(it);
  const days = Object.keys(byDay).sort();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner label="일정 불러오는 중…" /></div>;
  }
  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="text-4xl">🧭</p>
        <p className="mt-3 font-medium text-ink">일정을 찾을 수 없어요</p>
        <p className="mt-1 text-sm text-muted">링크가 만료되었거나 공유가 해제되었을 수 있어요.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-md pb-10">
      <Header title={trip?.title || "공유된 일정"} subtitle="공유받은 일정 (읽기 전용)" />
      <div className="space-y-4 p-4">
        {days.map((day) => (
          <section key={day}>
            <h2 className="mb-2 px-1 font-round font-bold text-ink">
              {day} <span className="text-xs font-normal text-muted">{byDay[day].length}곳</span>
            </h2>
            <div className="card p-4">
              {byDay[day].map((it, idx) => (
                <div key={it.id} className="relative flex gap-3 pb-3 last:pb-0">
                  {idx < byDay[day].length - 1 && <span className="absolute left-[11px] top-7 bottom-0 w-0.5 bg-transit/25" />}
                  <span className="z-10 mt-0.5 h-6 w-6 shrink-0 rounded-full bg-transit text-center text-xs font-bold leading-6 text-white">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {it.time && <span className="text-sm font-medium text-transit">{it.time}</span>}
                      <CategoryChip value={it.category} />
                    </div>
                    <p className="font-medium text-ink">{it.place}</p>
                    {it.address && <p className="text-xs text-muted">{it.address}</p>}
                    {it.note && <p className="mt-0.5 text-sm text-muted">{it.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        <p className="pt-4 text-center text-xs text-muted">旅 Tabi 로 만든 여행 일정</p>
      </div>
    </div>
  );
}
