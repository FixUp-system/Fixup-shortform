import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "./headers.js";
import { runWithActor } from "../actor.js";

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
export function withUser(handler, { adminOnly = false } = {}) {
  return async (req, ctx) => {
    let user;
    try {
      user = requireUser(req);
    } catch (e) {
      if (e instanceof NotApproved) {
        return Response.json({ error: e.message }, { status: 403 });
      }
      console.error("신원 확인 실패:", e.message);
      return Response.json({ error: "인증 설정에 문제가 있어요" }, { status: 500 });
    }
    if (adminOnly && user.role !== "admin") {
      return Response.json({ error: "권한이 없어요" }, { status: 403 });
    }
    return runWithActor(user.id, () => handler(req, ctx, user));
  };
}
