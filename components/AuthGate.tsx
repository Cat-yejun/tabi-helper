"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase, signUpUsername, signInUsername } from "@/lib/supabase";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
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

  // 공유 페이지는 로그인 없이 접근 허용
  if (pathname?.startsWith("/shared")) return <>{children}</>;

  async function submit() {
    if (!username.trim() || !password) return;
    if (password.length < 6) { setErr("비밀번호는 6자 이상이어야 해요."); return; }
    setBusy(true);
    setErr("");
    try {
      if (mode === "signup") {
        await signUpUsername(username, password);
        // 가입 직후 자동 로그인 시도
        await signInUsername(username, password);
      } else {
        await signInUsername(username, password);
      }
    } catch (e: any) {
      const msg = String(e.message || "");
      if (msg.includes("already registered")) setErr("이미 있는 아이디예요. 로그인해 주세요.");
      else if (msg.includes("Invalid login")) setErr("아이디 또는 비밀번호가 틀렸어요.");
      else setErr(msg || "오류가 발생했어요.");
    } finally {
      setBusy(false);
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

        <div className="card p-6">
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => { setMode("login"); setErr(""); }}
              className={`chip flex-1 justify-center py-2 ${mode === "login" ? "bg-ink text-white" : "bg-white text-muted border border-line"}`}
            >
              로그인
            </button>
            <button
              onClick={() => { setMode("signup"); setErr(""); }}
              className={`chip flex-1 justify-center py-2 ${mode === "signup" ? "bg-ink text-white" : "bg-white text-muted border border-line"}`}
            >
              회원가입
            </button>
          </div>

          <label className="mb-2 block text-sm">
            <span className="text-muted">아이디</span>
            <input
              className="field mt-1"
              placeholder="영문/숫자 아이디"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">비밀번호</span>
            <input
              type="password"
              className="field mt-1"
              placeholder="6자 이상"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </label>

          {err && <p className="mt-2 text-sm text-torii">{err}</p>}
          <button className="btn-primary mt-4 w-full" onClick={submit} disabled={busy || !username.trim() || !password}>
            {busy ? "처리 중…" : mode === "signup" ? "가입하고 시작하기" : "로그인"}
          </button>
          <p className="mt-3 text-center text-xs text-muted">
            이메일 없이 아이디만으로 가입돼요. 비밀번호를 잊으면 복구할 수 없으니 잘 기억해 주세요.
          </p>
        </div>
      </div>
    </div>
  );
}
