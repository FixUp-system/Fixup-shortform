// 저장소 구현을 고르는 유일한 자리.
//
// ★ 모르면 죽는다. env 가 빠졌을 때 조용히 인메모리로 떨어지면 저장이 되는 것처럼
// 보이다가 재시작하면 전부 사라진다. lib/fake.js 가 "모르는 값은 off(=진짜, 돈이
// 나감)로 본다"로 안전한 쪽을 고르는 것과 같은 규칙이다.
import { memoryStore } from "./memory.js";
// 정적 import 다. 지연 로드하려면 await import() 여야 하고(이 저장소는 ESM 이라
// require 가 없다) 그러면 getStore() 가 async 가 되어 호출부 전부에 await 이 붙는다.
// 대신 지연시켜야 하는 것은 모듈이 아니라 **클라이언트 생성**이므로, supabase.js 의
// db() 가 첫 호출 때 만든다 — import 만으로는 env 를 읽지 않는다.
import { supabaseStore } from "./supabase.js";

export function getStore() {
  if (process.env.SHOTFORM_STORE === "memory") return memoryStore;
  // 쓸 때가 아니라 **고를 때** 죽는다. 나중에 첫 쿼리에서 터지면 스택이
  // 파이프라인 한복판을 가리켜 원인이 env 라는 걸 알아보기 어렵다.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 필요해요 (테스트는 SHOTFORM_STORE=memory)"
    );
  }
  return supabaseStore;
}
