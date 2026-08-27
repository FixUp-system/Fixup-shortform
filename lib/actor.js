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

// ★★ 2026-08-27 — **역할도 함께 흘린다.** 운영자는 남의 프로젝트도 소유자처럼 고칠 수
//   있어야 하는데(사장님 지시), 그 판정을 라우트 스무 곳에 인자로 흘리면 중간 하나가
//   빠뜨린 자리만 조용히 못 고치는 화면이 된다 — 이 파일 머리말이 말하는 그 실패 모양이다.
//   신원은 요청 경계에서 이미 세우므로(withUser), 그 자리에 역할 한 글자를 더 얹는다.
//
// ★ 인자는 **문자열이든 { id, role } 이든** 받는다 — 스크립트는 예전처럼
//   `runWithActor("admin", …)` 로 부른다(그 "admin" 은 역할이 아니라 **주체 이름**이다).
export function runWithActor(actor, fn) {
  const id = typeof actor === "string" ? actor : actor?.id;
  if (!id) throw new Error("actor 가 필요해요 (runWithActor)");
  const role = typeof actor === "string" ? "" : String(actor.role || "");
  return storage.run({ actor: id, role }, fn);
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

// 지금 요청의 **역할**. 없으면 빈 문자열이다 — 던지지 않는다.
//
// ★ currentActor 와 다른 규칙인 이유: 저것은 "돈을 낸 사람이 누구인가"라 모르면 사고지만,
//   이것은 **권한을 넓히는 값**이다. 모를 때 넓히면 안 되고, 모를 때 좁히는 것은 안전하다.
//   (컨텍스트 밖에서 부르는 단위 테스트·스크립트가 조용히 운영자가 되지 않는다.)
export function currentRole() {
  return storage.getStore()?.role || "";
}
