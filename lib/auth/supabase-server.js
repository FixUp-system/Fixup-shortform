// 쿠키 세션을 읽는 Supabase 클라이언트 — **anon 키**를 쓴다.
//
// ★ 저장소(lib/store/supabase.js)의 service_role 클라이언트와 다른 물건이다.
// 이건 "이 요청이 누구인가"만 묻고, 데이터는 건드리지 않는다.
import { createServerClient } from "@supabase/ssr";

// cookieStore 는 Next 의 next/headers 의 cookies() 가 돌려주는 것을 기대한다 — get·getAll·
// set 은 있지만 **setAll 은 없다.** @supabase/ssr 은 setAll 이 없으면 던지지 않고
// console.warn 만 내고 쓰기를 조용히 버린다(호출처가 지금 0이라 안 터지고 있었을 뿐이다).
// 그래서 getAll·setAll 을 갖춘 어댑터를 직접 만들어 넘긴다.
export function authClient(cookieStore) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("SUPABASE_URL·SUPABASE_ANON_KEY 가 필요해요 (.env.local 확인)");
  }
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Server Component 안에서는 쿠키 쓰기가 막혀 있다(Next 제약) — 세션 갱신은
            // middleware 가 이미 처리하므로 여기서는 조용히 넘어간다.
          }
        });
      },
    },
  });
}
