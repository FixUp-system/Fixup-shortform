// GET /api/credits/history — 내 크레딧이 어디로 갔는지.
//
// 잔액 숫자 하나만 보여 주던 동안, 크레딧이 줄어든 사장님은 이유를 알 길이 없었다.
// 장부에는 다 남아 있었는데(credit_grants·credit_charges) 부르는 화면이 없었다.
//
// 합치는 규칙·부호·제목 붙이기는 lib/ledger-read.js 하나가 쥔다 — 운영자 백오피스도
// 같은 것을 부른다. 두 화면이 각자 합치면 언젠가 부호나 정렬이 갈린다.
import { withUser } from "../../../../lib/auth/require-user.js";
import { readLedger, ledgerLimit } from "../../../../lib/ledger-read.js";

export const GET = withUser(async (req, _ctx, user) => {
  const url = new URL(req.url || "http://localhost/api/credits/history");
  const before = Number(url.searchParams.get("before")) || undefined;
  return Response.json(await readLedger(user.id, { limit: ledgerLimit(url.searchParams.get("limit")), before }));
});
