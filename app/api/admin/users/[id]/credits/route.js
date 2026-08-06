// POST /api/admin/users/[id]/credits — 운영자 수동 충전(회수는 음수).
// 결제가 붙기 전까지 크레딧이 들어오는 유일한 문이다.
import { getStore } from "../../../../../../lib/store/index.js";
import { withUser } from "../../../../../../lib/auth/require-user.js";
import { balanceFor } from "../../../../../../lib/charges.js";

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // 크레딧으로 받아 크레딧으로 적는다 — 장부·가격표·화면이 전부 같은 단위다.
  // (USD 로 받아 환산하던 시절에는 편수라는 제3의 단위가 하나 더 있었다.)
  const credits = Number(body?.credits);
  if (!Number.isInteger(credits) || credits === 0) {
    return Response.json({ error: "크레딧은 0 이 아닌 정수여야 해요" }, { status: 400 });
  }
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return Response.json({ error: "사유를 적어 주세요" }, { status: 400 });
  }

  // ★ 대상이 실재하는지 먼저 본다 — 선례(같은 폴더의 PATCH)와 같은 방식이다.
  // 없으면 credit_grants.user_id 의 FK 가 insert 를 거부하고, 그 거부는 스토어의 raise()
  // 로 던져지는데 withUser 는 핸들러 예외를 안 잡는다 — 운영자 오타의 결말이 정체불명
  // 500 이 된다(uuid 형식이 틀리면 22P02 로 역시 500). 인메모리에는 FK 가 없어 이 갈림이
  // 테스트에서 안 보이므로, 라우트가 스스로 확인해 404 로 말해 준다.
  const store = getStore();
  if (!(await store.findProfiles([id])).get(id)) {
    return Response.json({ error: "사용자를 찾을 수 없어요" }, { status: 404 });
  }

  await store.insertGrant({
    user_id: id,
    amount_credits: credits,
    reason,
    granted_by: user.id,
  });

  return Response.json({ balance: await balanceFor(id) });
}, { adminOnly: true });
