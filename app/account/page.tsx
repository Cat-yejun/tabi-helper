"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, signOut } from "@/lib/supabase";
import { Header } from "@/components/ui";

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [counts, setCounts] = useState({ expenses: 0, itineraries: 0, translations: 0 });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    (async () => {
      const [e, i, t] = await Promise.all([
        supabase.from("expenses").select("id", { count: "exact", head: true }),
        supabase.from("itineraries").select("id", { count: "exact", head: true }),
        supabase.from("translations").select("id", { count: "exact", head: true }),
      ]);
      setCounts({
        expenses: e.count || 0,
        itineraries: i.count || 0,
        translations: t.count || 0,
      });
    })();
  }, []);

  return (
    <>
      <Header title="내 정보" />
      <div className="space-y-4 p-4">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink font-round text-lg font-bold text-white">
              {((user?.user_metadata as any)?.username || user?.email?.split("@")[0] || "?")[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{(user?.user_metadata as any)?.username || user?.email?.split("@")[0] || "—"}</p>
              <p className="text-xs text-muted">
                {user?.created_at && `가입일 ${new Date(user.created_at).toLocaleDateString("ko-KR")}`}
              </p>
            </div>
          </div>
        </div>

        <div className="card grid grid-cols-3 divide-x divide-line p-4 text-center">
          <div>
            <p className="font-round text-xl font-bold text-ink">{counts.expenses}</p>
            <p className="text-xs text-muted">가계부</p>
          </div>
          <div>
            <p className="font-round text-xl font-bold text-ink">{counts.itineraries}</p>
            <p className="text-xs text-muted">일정표</p>
          </div>
          <div>
            <p className="font-round text-xl font-bold text-ink">{counts.translations}</p>
            <p className="text-xs text-muted">번역</p>
          </div>
        </div>

        <div className="card p-4 text-sm text-muted">
          모든 데이터는 이 계정에만 연결되어 다른 사용자는 볼 수 없어요.
        </div>

        <button className="btn-ghost w-full text-torii" onClick={() => signOut()}>
          로그아웃
        </button>
      </div>
    </>
  );
}
