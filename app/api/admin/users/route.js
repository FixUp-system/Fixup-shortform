// GET /api/admin/users — 승인 대기·전체 사용자 목록 (운영자 전용)
// POST /api/admin/users — 운영자가 계정을 **바로 만든다** (2026-09-17)
import { createClient } from "@supabase/supabase-js";
import { withUser } from "../../../../lib/auth/require-user.js";
import { getStore } from "../../../../lib/store/index.js";
import { NAME_MAX } from "../../../../lib/display-name.js";
import { passwordProblem } from "../../../../lib/password.js";
import { grantSignupCreditsOnce } from "../../../../lib/admin/signup-grant.js";
// 잔액을 보이는 값으로 만드는 규칙은 한 곳이다 — 사장님 화면과 같은 값이어야 한다
import { floorBalance } from "../../../../lib/charges.js";

export const GET = withUser(async (_req, _ctx, user) => {
  const store = getStore();
  const users = await store.listProfiles();
  const ids = users.map((u) => u.id);

  // 잔액은 두 장부의 차다(충전 − 청구). 둘 다 **묶음으로 한 번씩** 받는다.
  //
  // ★★ 그리고 **둘을 겹친다**(2026-08-20). 그전에는 충전을 기다린 뒤 청구를 시작해서
  //   왕복이 셋이었다 — 그런데 둘 다 위에서 얻은 id 목록만 있으면 되므로 기다릴 이유가
  //   없었다. 겹칠 수 있는 것을 줄 세우고 있었을 뿐이다.
  //   실측(2026-08-20, 한국·10명): 236ms → 85ms. 프로덕션은 함수가 미국 동부에서 도니
  //   왕복 하나가 더 비싸고, 줄어드는 절대량은 더 크다. 보관함이 왕복 하나짜리 단일
  //   쿼리라 더 빨랐던 것도 같은 이유다.
  // ★ 청구 묶음 조회(listChargesFor)는 이 자리를 위해 만들었다 — 그전에는 충전만 묶음이고
  //   청구는 사람마다 따로였다.
  const [grants, charges] = await Promise.all([
    store.listGrantsFor(ids),
    store.listChargesFor(ids),
  ]);

  // ★ 칸이 없는 사람은 0 이다 — 두 장부 모두 "없으면 안 담는다"가 규약이다.
  // ★ `self` — **내 줄인가.** 역할 고르는 자리를 내 줄에서만 잠그는 데 쓴다(자기를
  //   강등하면 아무도 못 들어온다 — lib/admin/self-guard.js). 화면이 자기 id 를 알려면
  //   왕복이 하나 더 늘고, 그 값은 이미 여기 있다.
  const withCredits = users.map((u) => ({
    ...u,
    self: u.id === user.id,
    balance: floorBalance((grants.get(u.id) || 0) - (charges.get(u.id) || 0)),
  }));
  return Response.json({ users: withCredits });
}, { adminOnly: true });

// ★★★ 운영자가 계정을 바로 만든다(2026-09-17 사장님 지시: "사용자 관리에서 계정을 바로
//   추가할 수 있게"). 그전에는 상대가 가입 화면에서 직접 가입 → 운영자가 승인하는 길뿐이었다.
//
// ★ 만든 계정은 **곧바로 승인된 상태**다 — 운영자가 손으로 만든 계정을 다시 승인 대기에 세울
//   이유가 없다. 그래서 승인과 같은 결과를 한 번에 만든다:
//   · 게이트(app_metadata)와 원장(profiles) 모두 approved — PATCH 와 같은 이중 쓰기
//   · 가입 기본 지급 한 번(lib/admin/signup-grant.js — 승인 PATCH 와 **같은 함수**)
// ★ 이메일 확인을 건너뛴다(email_confirm: true) — 메일 왕복이 없는 이 서비스의 규약 그대로다.
// ★ 비밀번호 규칙은 가입·재설정과 한 벌이다(lib/password.js). 운영자라고 약한 비밀번호를 못 넘긴다.
// ★ 역할은 늘 사용자다 — 운영자를 만드는 일은 만든 뒤 역할을 바꾸는 한 번을 더 거친다.
export const POST = withUser(async (req, _ctx, user) => {
  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = (typeof body?.name === "string" ? body.name : "").trim().slice(0, NAME_MAX);
  if (!name) return Response.json({ error: "이름을 넣어 주세요" }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "이메일 주소를 다시 확인해 주세요" }, { status: 400 });
  }
  const weak = passwordProblem(password);
  if (weak) return Response.json({ error: weak }, { status: 400 });

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { status: "approved", role: "user" },
  });
  if (error) {
    if (/already (been )?registered|already exists/i.test(error.message || "")) {
      return Response.json({ error: "이미 가입된 이메일이에요" }, { status: 409 });
    }
    console.error("계정 추가 실패:", error.message);
    return Response.json({ error: "계정을 만들지 못했어요" }, { status: 502 });
  }
  const id = data?.user?.id;
  if (!id) return Response.json({ error: "계정을 만들지 못했어요" }, { status: 502 });

  // 원장 줄은 DB 트리거(handle_new_user)가 만든다. 트리거가 없는 환경(인메모리 저장소 등)에서도
  // 같은 결과가 나오도록, 없으면 만든다.
  const store = getStore();
  if (!(await store.findProfiles([id])).get(id)) {
    await store.insertProfile({ id, email });
  }
  await store.updateProfile(id, {
    status: "approved",
    approved_at: new Date().toISOString(),
    display_name: name,
  });
  // 지급이 실패해도 계정은 이미 만들어졌다 — 되돌리지 않고 로그로 남긴다(PATCH 와 같은 판단).
  await grantSignupCreditsOnce(store, id, user.id).catch((e) => {
    console.error(`가입 기본 지급 실패 — user=${id}:`, e?.message || e);
  });

  console.log(`[계정 추가] ${user.id} → ${id}`);
  return Response.json({ ok: true, id }, { status: 201 });
}, { adminOnly: true });
