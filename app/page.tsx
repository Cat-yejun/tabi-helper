"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Expense, ItineraryItem } from "@/lib/types";
import { Header } from "@/components/ui";

export default function Home() {
  const [spent, setSpent] = useState(0);
  const [count, setCount] = useState(0);
  const [next, setNext] = useState<ItineraryItem[]>([]);

  useEffect(() => {
    (async () => {
      const { data: exp } = await supabase.from("expenses").select("total");
      if (exp) {
        setCount(exp.length);
        setSpent(exp.reduce((s, e: Pick<Expense, "total">) => s + (e.total || 0), 0));
      }
      const today = new Date().toISOString().slice(0, 10);
      const { data: items } = await supabase
        .from("itinerary_items")
        .select("*")
        .gte("day_date", today)
        .order("day_date")
        .order("sort_order")
        .limit(4);
      if (items) setNext(items as ItineraryItem[]);
    })();
  }, []);

  const actions = [
    { href: "/expenses?new=1", label: "영수증 찍기", icon: "📷", tone: "bg-torii" },
    { href: "/itinerary?new=1", label: "일정 만들기", icon: "✦", tone: "bg-transit" },
    { href: "/translate", label: "번역하기", icon: "あ", tone: "bg-amber" },
    { href: "/assistant", label: "비서에게 묻기", icon: "💬", tone: "bg-ink" },
  ];

  return (
    <>
      <Header
        title="Tabi"
        subtitle="일본 여행 도우미"
        right={
          <Link href="/account" className="text-xs text-muted">
            내 정보
          </Link>
        }
      />
      <div className="space-y-5 p-4">
        {/* 지출 요약 */}
        <Link href="/expenses" className="card block overflow-hidden p-0">
          <div className="bg-ink p-5 text-white">
            <p className="text-xs opacity-70">이번 여행 총 지출</p>
            <p className="mt-1 font-round text-3xl font-extrabold">
              ¥{Math.round(spent).toLocaleString()}
            </p>
            <p className="mt-1 text-xs opacity-70">영수증 {count}건 기록됨 · KRW 약 ₩{Math.round(spent * 9.3).toLocaleString()}</p>
          </div>
        </Link>

        {/* 빠른 실행 */}
        <div className="grid grid-cols-2 gap-3">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className={`${a.tone} flex items-center gap-2 rounded-2xl p-4 text-white shadow-soft active:scale-[0.98]`}
            >
              <span className="text-xl">{a.icon}</span>
              <span className="font-medium">{a.label}</span>
            </Link>
          ))}
        </div>

        {/* 다가오는 일정 */}
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="font-round font-bold text-ink">다가오는 일정</h2>
            <Link href="/itinerary" className="text-sm text-transit">
              전체 보기
            </Link>
          </div>
          {next.length === 0 ? (
            <div className="card p-5 text-center text-sm text-muted">
              아직 일정이 없어요. <Link href="/itinerary?new=1" className="text-transit">만들러 가기</Link>
            </div>
          ) : (
            <div className="card divide-y divide-line">
              {next.map((it) => (
                <div key={it.id} className="flex items-center gap-3 p-3">
                  <span className="w-12 shrink-0 text-sm font-medium text-transit">
                    {it.time || "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{it.place}</p>
                    <p className="text-xs text-muted">{it.day_date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
