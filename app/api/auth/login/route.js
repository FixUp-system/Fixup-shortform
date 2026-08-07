// POST /api/auth/login — 이메일+비밀번호. 성공하면 세션 쿠키가 선다.
//
// ★ 인증 실패는 **한 문구로 뭉갠다.** "없는 계정"과 "틀린 비밀번호"를 가르면 어느 주소가
// 가입돼 있는지 밖에서 셀 수 있다(계정 열거). 가입 실패는 반대다 — 그건 사용자가 알아야
// 다음 행동을 정한다.
import { cookies } from "next/headers";
import { authClient } from "../../../../lib/auth/supabase-server.js";
// ★ 사용자 잘못이 아닌 실패(네트워크·5xx·429)를 갈라내는 판정은 lib/auth/infra-error.js
// 한 곳에 있다 — 가입·비밀번호 변경과 같은 계약을 쓴다. 여기서 갈라내도
// **없는 계정과 틀린 비밀번호는 여전히 안 가른다.**
import { isInfra, infraResponse } from "../../../../lib/auth/infra-error.js";

const WRONG = "이메일 또는 비밀번호가 맞지 않아요";

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
      return infraResponse(error);
    }
    console.error("로그인 실패:", error.message);
    return Response.json({ error: WRONG }, { status: 401 });
  }
  return Response.json({ ok: true });
}
