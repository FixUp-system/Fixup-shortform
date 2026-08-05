// POST /api/admin/users/[id]/credits — 운영자 수동 충전(회수는 음수).
// 결제가 붙기 전까지 크레딧이 들어오는 유일한 문이다.
import { getStore } from "../../../../../../lib/store/index.js";
import { withUser } from "../../../../../../lib/auth/require-user.js";
import { balanceFor, videosLeft, perVideoUsd } from "../../../../../../lib/credits.js";

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // 편수로 받는다 — 운영자도 사장님과 같은 말을 쓰게. 저장은 USD 다(원장과 같은 단위).
  const videos = Number(body?.videos);
  if (!Number.isInteger(videos) || videos === 0) {
    return Response.json({ error: "편수는 0 이 아닌 정수여야 해요" }, { status: 400 });
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
    amount_usd: videos * perVideoUsd(),
    reason,
    granted_by: user.id,
  });

  const balance = await balanceFor(id);
  return Response.json({ balance_usd: balance, videos_left: videosLeft(balance) });
}, { adminOnly: true });
