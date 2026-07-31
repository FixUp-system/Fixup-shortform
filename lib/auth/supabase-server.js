// 쿠키 세션을 읽는 Supabase 클라이언트 — **anon 키**를 쓴다.
//
// ★ 저장소(lib/store/supabase.js)의 service_role 클라이언트와 다른 물건이다.
// 이건 "이 요청이 누구인가"만 묻고, 데이터는 건드리지 않는다.
import { createServerClient } from "@supabase/ssr";

export function authClient(cookieStore) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("SUPABASE_URL·SUPABASE_ANON_KEY 가 필요해요 (.env.local 확인)");
  }
  return createServerClient(url, anon, { cookies: cookieStore });
}
