// GET /api/me — 내 정보 한 자리.
//
// 상단바(components/UserMenu.jsx)와 마이페이지(app/me/page.js)가 **이 하나**를 쓴다.
// 이름과 크레딧을 따로 부르면 화면 진입마다 왕복이 두 번이 된다.
//
// GET /api/credits 는 남긴다 — QuickCreate 등이 이미 쓰고 있고 이번 작업의 범위가 아니다.
import { withUser } from "../../../lib/auth/require-user.js";
import { getStore } from "../../../lib/store/index.js";
import { balanceFor } from "../../../lib/charges.js";
import { fakeFal } from "../../../lib/fake.js";
import { displayNameOf, NAME_MAX } from "../../../lib/display-name.js";

export const GET = withUser(async (_req, _ctx, user) => {
  const store = getStore();
  const profile = (await store.findProfiles([user.id])).get(user.id);
  // 신원은 있는데 원장에 행이 없으면 가입 트리거가 빠진 것이다 — 빈 값으로 덮지 않는다.
  if (!profile) {
    console.error("프로필 행이 없다:", user.id);
    return Response.json({ error: "프로필을 찾을 수 없어요" }, { status: 404 });
  }
  return Response.json({
    email: profile.email,
    name: displayNameOf(profile),
    created_at: profile.created_at ?? null,
    balance: await balanceFor(user.id),
    // ★ gated 는 "잔액 부족"이 아니라 "크레딧 게이트가 켜져 있음"이다(/api/credits 와 같은 규칙).
    // 실모드면 잔액과 무관하게 늘 true 이고, 잔액 판정은 화면이 gated && balance < 가격 으로 한다.
    gated: !fakeFal(),
    projectCount: await store.countProjects(user.id),
  });
});

// PATCH /api/me — 이름만 고친다.
//
// ★ 몸통을 그대로 updateProfile 에 넘기면 status·role 이 함께 넘어간다(권한 상승).
// 화이트리스트로 이름 하나만 뽑는다.
export const PATCH = withUser(async (req, _ctx, user) => {
  const body = await req.json().catch(() => ({}));
  if (typeof body?.name !== "string") {
    return Response.json({ error: "이름을 넣어 주세요" }, { status: 400 });
  }
  const name = body.name.trim();
  if (name.length > NAME_MAX) {
    return Response.json({ error: `이름은 ${NAME_MAX}자까지예요` }, { status: 400 });
  }
  // 빈 이름은 지우는 것으로 본다 — null 이면 화면이 이메일 앞부분으로 돌아간다.
  await getStore().updateProfile(user.id, { display_name: name || null });
  return Response.json({ ok: true });
});
