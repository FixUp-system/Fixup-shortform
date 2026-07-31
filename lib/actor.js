// 비용을 낸 주체를 요청 경계에서 백그라운드까지 흘린다.
//
// ★ 왜 인자로 넘기지 않는가: costActor() 를 부르는 7개 모듈(llm·imagegen·i2v·tts·vlm·
// compose·video)이 전부 **응답이 끝난 뒤 도는 백그라운드**에서 불린다. 인자로 넘기려면
// 라우트 → 파이프라인 → 7개 모듈까지 시그니처가 줄줄이 바뀌고, 중간 하나가 빠뜨리면
// 그 아래가 조용히 기본값으로 떨어진다 — 레퍼런스의 "조용한 탈락"과 같은 실패 모양이다.
//
// ★ 없으면 던진다. "local" 같은 기본값으로 떨어지면 감싸는 것을 빠뜨린 자리가 영원히
// 안 드러나고, 원장의 81%(클립·이미지)가 주인을 잃은 채로 크레딧 단계에 들어간다.
import { AsyncLocalStorage } from "async_hooks";

const storage = new AsyncLocalStorage();

export function runWithActor(actor, fn) {
  if (!actor) throw new Error("actor 가 필요해요 (runWithActor)");
  return storage.run({ actor }, fn);
}

export function currentActor() {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      "actor 컨텍스트가 없어요 — 이 자리는 runWithActor 로 감싸야 합니다 " +
        "(라우트는 requireUser, 스크립트는 runWithActor(\"admin\", …))"
    );
  }
  return ctx.actor;
}
