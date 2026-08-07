// 인증 오류 중 **사장님 잘못이 아닌 것**을 갈라내는 한 자리.
//
// 같은 판정이 로그인·가입·비밀번호 변경 세 곳에 복사돼 있었다. 한쪽만 고치면 계약이
// 갈라지므로(429 를 한 곳만 다르게 답하는 식) 함수를 여기로 모은다.
//
// ★ supabase-js 는 네트워크 실패·잘못된 URL·Supabase 5xx(무료 플랜 일시정지 포함)를
// **던지지 않고** error 로 돌려준다(AuthRetryableFetchError — status 가 0 이거나 5xx).
// 그걸 인증 실패로 뭉개면 프로젝트가 멈춘 동안 사장님은 자기 비밀번호를 의심하며 계속
// 다시 누른다.
//
// ★ 429(요청 과다)도 같은 계급이다 — 비밀번호는 맞는데 지금 답할 수 없는 것뿐이다.
// "비밀번호가 맞지 않아요"로 답하면 고칠 것도 없는데 계속 다시 눌러 더 오래 막힌다.
// 특히 /api/me/password 는 재검증마다 진짜 로그인 시도를 쏘므로 429 에 쉽게 닿는다.
// 단 429 는 "서버가 죽었다"가 아니므로 500 으로 뭉개지 않고 **429 를 그대로** 돌려준다.
//
// status 가 없으면(옛 버전·모킹) 인프라가 아닌 쪽으로 떨어뜨린다: 안전한 방향이다.

export const DOWN = "인증 서버에 연결하지 못했어요 — 잠시 후 다시 시도해 주세요";
export const BUSY = "요청이 너무 잦아요 — 잠시 후 다시 시도해 주세요";

export function isRateLimited(error) {
  return error?.status === 429;
}

export function isInfra(error) {
  const s = error?.status;
  return typeof s === "number" && (s === 0 || s === 429 || s >= 500);
}

// 라우트가 그대로 돌려줄 응답. 문구도 상태 코드도 세 라우트에서 같다.
//
// ★ 이 문구는 로그인의 계정 열거 차단 계약을 깨지 않는다 — 429 는 인증 결과가 아니라
// "지금은 답할 수 없다"라, 계정이 있든 없든 똑같이 나간다.
export function infraResponse(error) {
  if (isRateLimited(error)) {
    return Response.json({ error: BUSY }, { status: 429 });
  }
  return Response.json({ error: DOWN }, { status: 500 });
}
