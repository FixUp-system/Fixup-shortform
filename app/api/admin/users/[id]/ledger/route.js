// GET /api/admin/users/[id]/ledger — 운영자가 한 사람의 **사용 비용(USD)** 을 본다 (운영자 전용).
//
// ★★ 2026-09-07 — 이 문이 돌려주던 것이 **크레딧 내역에서 실제 비용으로 바뀌었다**
//   (사장님 지시: "내역이 크레딧으로 나오는데 실제 비용으로 변경해줘").
//   운영자가 알고 싶은 것은 "이 사람이 **우리 돈**을 얼마나 썼나"이고, 그 값은 크레딧 장부가
//   아니라 원가 원장(`cost_records`)에 있다. 지금 크레딧은 꺼져 있어(SHOTFORM_NO_CREDITS=1)
//   그 장부는 사실상 비어 있기도 하다.
//
// ★ **크레딧 내역이 사라진 것은 아니다** — 마이페이지(/me)가 `lib/ledger-read.js` 로 그대로
//   읽는다. 거기서는 크레딧이 맞는 단위다. 두 화면이 **다른 장부**를 보는 것이지 갈린 것이
//   아니다(같은 장부를 두 규칙으로 읽는 것만 금지다).
//
// ★ 주소를 안 바꿨다 — 부르는 곳이 백오피스 화면 하나뿐이라 새 주소를 만들 이유가 없다.
//
// ★ adminOnly 다. 이 문이 열리면 아무나 남의 지출을 들여다본다.
import { withUser } from "../../../../../../lib/auth/require-user.js";
import { readCosts, costLimit } from "../../../../../../lib/cost-read.js";

export const GET = withUser(async (req, { params }) => {
  const { id } = await params;
  const url = new URL(req.url || "http://localhost/l");
  // 커서는 **시각**이다(번호가 아니다) — 그 사이 새 기록이 쌓여도 겹치거나 건너뛰지 않는다.
  const before = Number(url.searchParams.get("before")) || undefined;
  return Response.json(await readCosts(id, { limit: costLimit(url.searchParams.get("limit")), before }));
}, { adminOnly: true });
