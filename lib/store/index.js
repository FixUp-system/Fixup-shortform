// 저장소 구현을 고르는 유일한 자리.
//
// ★ 모르면 죽는다. env 가 빠졌을 때 조용히 인메모리로 떨어지면 저장이 되는 것처럼
// 보이다가 재시작하면 전부 사라진다. lib/fake.js 가 "모르는 값은 off(=진짜, 돈이
// 나감)로 본다"로 안전한 쪽을 고르는 것과 같은 규칙이다.
import { memoryStore } from "./memory.js";

export function getStore() {
  if (process.env.SHOTFORM_STORE === "memory") return memoryStore;
  // 다음 태스크에서 여기에 Supabase 갈래가 붙는다(lib/store/supabase.js).
  // 계획서의 예시는 require() 로 지연 로드했지만 이 저장소는 ESM 이라 require 가 없다 —
  // 지연 로드가 필요하면 await import() 여야 하고, 그러면 getStore() 가 async 가 되어
  // 호출부 전부가 바뀐다. 그 결정은 supabase.js 를 만드는 태스크에서 한다.
  // 그때까지 이 갈래는 "조용히 인메모리로 떨어지지 않는다"를 지키는 쪽으로만 둔다.
  throw new Error(
    "SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 필요해요 (테스트는 SHOTFORM_STORE=memory)"
  );
}
