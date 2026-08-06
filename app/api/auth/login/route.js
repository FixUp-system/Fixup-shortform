// POST /api/auth/login — 이메일+비밀번호. 성공하면 세션 쿠키가 선다.
//
// ★ 인증 실패는 **한 문구로 뭉갠다.** "없는 계정"과 "틀린 비밀번호"를 가르면 어느 주소가
// 가입돼 있는지 밖에서 셀 수 있다(계정 열거). 가입 실패는 반대다 — 그건 사용자가 알아야
// 다음 행동을 정한다.
import { cookies } from "next/headers";
import { authClient } from "../../../../lib/auth/supabase-server.js";

const WRONG = "이메일 또는 비밀번호가 맞지 않아요";
const DOWN = "인증 서버에 연결하지 못했어요 — 잠시 후 다시 시도해 주세요";

// ★ supabase-js 는 네트워크 실패·잘못된 URL·Supabase 5xx(무료 플랜 일시정지 포함)를
// **던지지 않고** error 로 돌려준다(AuthRetryableFetchError — status 가 0 이거나 5xx).
// 그걸 인증 실패로 뭉개면 프로젝트가 멈춘 동안 사장님은 자기 비밀번호를 의심하며 계속
// 다시 누른다. 그래서 이것만 갈라낸다 — **없는 계정과 틀린 비밀번호는 여전히 안 가른다.**
// status 가 없으면(옛 버전·모킹) 인증 실패 쪽으로 떨어뜨린다: 안전한 방향이다.
function isInfra(error) {
  const s = error?.status;
  return typeof s === "number" && (s === 0 || s >= 500);
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
    // env 누락 같은 설정 문제 — 사용자 잘못이 아니므로 인증 실패와 구분한다
    console.error("인증 클라이언트 생성 실패:", e.message);
    return Response.json({ error: "인증 설정에 문제가 있어요" }, { status: 500 });
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // 원문을 화면에 내보내지 않는다(계정 열거·영문 노출). 서버 로그에는 남긴다.
    if (isInfra(error)) {
      console.error("인증 서버 오류:", error.status, error.message);
      return Response.json({ error: DOWN }, { status: 500 });
    }
    console.error("로그인 실패:", error.message);
    return Response.json({ error: WRONG }, { status: 401 });
  }
  return Response.json({ ok: true });
}
