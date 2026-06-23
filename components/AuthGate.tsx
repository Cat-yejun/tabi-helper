"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, sendMagicLink } from "@/lib/supabase";

// 로그인 안 된 사용자에게는 매직링크 화면을, 로그인된 사용자에게는 앱을 보여줌
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit() {
    if (!email.trim()) return;
    setSending(true);
    setErr("");
    try {
      await sendMagicLink(email.trim());
      setSent(true);
    } catch (e: any) {
      setErr(e.message || "발송 실패");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-transit border-t-transparent" />
      </div>
    );
  }

  if (user) return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-round text-5xl font-extrabold text-ink">旅</p>
          <h1 className="mt-2 font-round text-2xl font-extrabold text-ink">Tabi</h1>
          <p className="mt-1 text-sm text-muted">일본 여행 도우미</p>
        </div>

        {sent ? (
          <div className="card p-6 text-center">
            <p className="text-2xl">📮</p>
            <p className="mt-2 font-medium text-ink">메일을 확인하세요</p>
            <p className="mt-1 text-sm text-muted">
              {email} 로 로그인 링크를 보냈어요.<br />링크를 누르면 자동으로 로그인됩니다.
            </p>
            <button className="mt-4 text-sm text-transit" onClick={() => setSent(false)}>
              다른 이메일로 다시 보내기
            </button>
          </div>
        ) : (
          <div className="card p-6">
            <p className="mb-3 text-sm text-muted">
              이메일만 입력하면 비밀번호 없이 로그인 링크를 보내드려요.
            </p>
            <input
              type="email"
              className="field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {err && <p className="mt-2 text-sm text-torii">{err}</p>}
            <button className="btn-primary mt-3 w-full" onClick={submit} disabled={sending || !email.trim()}>
              {sending ? "보내는 중…" : "로그인 링크 받기"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
