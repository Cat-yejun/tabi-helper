import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 매직링크 세션을 브라우저에 저장하고, URL 의 토큰을 자동 감지
export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// 아이디를 내부 이메일로 변환 (Supabase Auth 는 이메일 기반이라 가짜 도메인 사용)
function usernameToEmail(username: string): string {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  return `${clean}@tabi.local`;
}

// 아이디+비밀번호 회원가입
export async function signUpUsername(username: string, password: string) {
  const { error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username: username.trim() } },
  });
  if (error) throw error;
}

// 아이디+비밀번호 로그인
export async function signInUsername(username: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// 사진을 photos 버킷의 "사용자ID/폴더" 경로에 올리고 공개 URL 반환
export async function uploadPhoto(file: File, folder: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${user.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("photos").getPublicUrl(path);
  return data.publicUrl;
}
