import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "./headers.js";
import { runWithActor } from "../actor.js";
import { BudgetExceeded } from "../costs.js";
// 손님(비로그인) 판정 한 벌 — middleware 가 통과시킨 그 조건을 라우트도 같은 함수로 본다.
import { guestArchiveOn, isGuestPath, GUEST_ACTOR } from "./guest.js";

export class NotApproved extends Error {
  constructor(status) {
    super(status === "blocked" ? "이용이 중지된 계정이에요" : "아직 승인 대기 중이에요");
    this.name = "NotApproved";
    this.status = status;
  }
}

// 라우트는 검증하지 않는다 — middleware 가 이미 했다. 여기서는 읽기만 한다.
// 그래서 인가 판정 로직이 라우트 23곳에 복사되지 않는다.
export function requireUser(req) {
  const id = req.headers.get(USER_HEADER);
  if (!id) {
    // matcher 밖에 새 라우트가 생기면 여기로 온다. 조용히 통과시키면
    // 그 라우트만 인증 없이 도는 상태가 영원히 안 드러난다.
    throw new Error(
      "신원 헤더가 없어요 — 이 경로가 middleware matcher 밖입니다 (middleware.js 확인)"
    );
  }
  const status = req.headers.get(STATUS_HEADER) || "pending";
  if (status !== "approved") throw new NotApproved(status);
  return { id, status, role: req.headers.get(ROLE_HEADER) || "user" };
}

// 라우트 한 겹 감싸기 — 신원 확인 + actor 컨텍스트를 한 번에 세운다.
// handler 는 (req, ctx, user) 를 받는다.
// guest: true — **손님(비로그인)도 지날 수 있는 읽기 문**이라는 표시다(2026-08-27).
//   그때 handler 는 user 로 `null` 을 받는다. 무엇이 손님에게 열려 있는지는
//   lib/auth/guest.js 의 목록 하나가 정한다 — 이 옵션을 붙였다고 열리는 것이 아니라,
//   그 목록에 있고 스위치가 켜져 있어야 열린다(둘 다여야 한다).
// ★ adminOnly 와 함께 쓰지 마라 — 뜻이 정반대다.
export function withUser(handler, { adminOnly = false, guest = false } = {}) {
  return async (req, ctx) => {
    let user;
    try {
      user = requireUser(req);
    } catch (e) {
      // ★★ 신원이 없다 = middleware 가 손님으로 통과시켰거나, matcher 밖의 새 라우트다.
      //   **둘을 가른다**: 이 문이 손님을 받는 문이고(guest), 스위치가 켜져 있고,
      //   지금 주소가 그 목록에 있을 때만 손님으로 읽는다. 그 밖은 예전처럼 500 이다 —
      //   그 500 이 "이 경로가 matcher 밖이다"를 드러내는 유일한 신호다.
      const noIdentity = !(e instanceof NotApproved);
      if (guest && noIdentity && guestArchiveOn() && isGuestPath(new URL(req.url, "http://x").pathname, req.method)) {
        // actor 는 세운다 — 컨텍스트가 없으면 costActor() 가 던진다(읽기 문이라 쓸 일은
        // 없지만, 없는 컨텍스트로 도는 자리를 만들지 않는다).
        return runWithActor(GUEST_ACTOR, () => handler(req, ctx, null));
      }
      if (e instanceof NotApproved) {
        return Response.json({ error: e.message }, { status: 403 });
      }
      console.error("신원 확인 실패:", e.message);
      return Response.json({ error: "인증 설정에 문제가 있어요" }, { status: 500 });
    }
    if (adminOnly && user.role !== "admin") {
      return Response.json({ error: "권한이 없어요" }, { status: 403 });
    }
    // ★ 예산·체험 오류는 사장님에게 보여줄 답이 있는 실패다 — 프레임워크 500 으로 흘리면
    // "왜 안 되지"만 남는다. 라우트마다 붙이면 새 라우트에서 또 빠뜨리므로 여기서 옮긴다
    // (인가를 이 파일에서 다루는 것과 같은 이유다).
    //
    // 축에 따라 코드가 다르다: 사장님이 할 일이 있으면 402, 우리 안전핀이면 503 이다.
    // 예산과 무관한 오류는 **그대로 던진다** — 여기서 삼키면 진짜 사고가 402 로 뭉개진다.
    //
    // ⚠️ 여기까지 못 오는 자리가 있다: 비동기 넷(`/images`·`/voice`·`/clips`·`/auto`)은
    // fire-and-forget 이라 파이프라인이 던질 때 응답이 이미 나갔다. 그쪽 실패는 HTTP 코드가
    // 아니라 프로젝트 문서의 `images_error`·`voice_error`·`video_error`·`auto.state` 로만
    // 보인다(문구는 BudgetExceeded 의 것이 그대로 실린다). 구조상 옮길 수 없다.
    try {
      // ★ 역할도 함께 세운다(2026-08-27) — 운영자는 남의 프로젝트도 소유자처럼 고친다.
      //   판정은 lib/projects.js 한 곳이 본다(라우트는 예전과 글자 그대로다).
      return await runWithActor({ id: user.id, role: user.role }, () => handler(req, ctx, user));
    } catch (e) {
      if (e instanceof BudgetExceeded) {
        console.error("예산 가드:", e.scope, e.message);
        const ours = e.scope === "total";
        return Response.json({ error: e.message }, { status: ours ? 503 : 402 });
      }
      throw e;
    }
  };
}
