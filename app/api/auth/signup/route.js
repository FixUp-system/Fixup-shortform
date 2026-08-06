// POST /api/auth/signup — 이메일+비밀번호. 가입하면 그 자리에서 세션이 선다.
//
// 이메일 인증을 받지 않는다(Supabase 의 Confirm email 을 꺼 둔다). 가짜 주소는
// 운영자 승인제가 거른다 — 가입은 되지만 승인 전에는 /pending 에서 아무것도 못 한다.
import { cookies } from "next/headers";
import { authClient } from "../../../../lib/auth/supabase-server.js";

const DOWN = "인증 서버에 연결하지 못했어요 — 잠시 후 다시 시도해 주세요";

// ★ supabase-js 는 네트워크 실패·Supabase 5xx(무료 플랜 일시정지 포함)를 던지지 않고
// error 로 돌려준다(status 가 0 이거나 5xx). 그걸 400 "가입하지 못했어요"로 답하면
// 사장님은 자기 입력을 고치려 든다 — 고칠 것이 없는데. 사용자 잘못이 아닌 것은 500 이다.
// status 가 없으면(옛 버전·모킹) 입력 문제 쪽으로 떨어뜨린다: 안전한 방향이다.
function isInfra(error) {
  const s = error?.status;
  return typeof s === "number" && (s === 0 || s >= 500);
}

// Supabase 오류 원문을 사장님 말로 옮긴다. 모르는 것은 뭉뚱그리되 로그에는 원문을 남긴다.
function reason(message) {
  const m = String(message || "");
  if (/already registered|already exists/i.test(m)) return "이미 가입된 이메일이에요 — 로그인해 주세요";
  if (/password/i.test(m)) return "비밀번호가 너무 짧아요 — 6자 이상으로 정해 주세요";
  if (/email/i.test(m)) return "이메일 주소를 다시 확인해 주세요";
  return "가입하지 못했어요 — 잠시 후 다시 시도해 주세요";
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return Response.json({ error: "이메일과 비밀번호를 넣어 주세요" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = authClient(await cookies());
  } catch (e) {
    console.error("인증 클라이언트 생성 실패:", e.message);
    return Response.json({ error: "인증 설정에 문제가 있어요" }, { status: 500 });
  }

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    if (isInfra(error)) {
      console.error("인증 서버 오류:", error.status, error.message);
      return Response.json({ error: DOWN }, { status: 500 });
    }
    console.error("가입 실패:", error.message);
    return Response.json({ error: reason(error.message) }, { status: 400 });
  }
  return Response.json({ ok: true });
}
