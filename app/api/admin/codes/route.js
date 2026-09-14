// /api/admin/codes — 크레딧 코드 발급·목록 (운영자 전용, 2026-09-14)
// 와디즈 명단을 붙여 넣은 행마다 코드 하나. 메일은 우리가 안 보낸다(메일 머지).
// 설계: docs/superpowers/specs/2026-09-14-credit-codes-design.md
import { randomInt } from "node:crypto";
import { withUser } from "../../../../lib/auth/require-user.js";
import { getStore } from "../../../../lib/store/index.js";
import { generateCode, MAX_CODE_ROWS } from "../../../../lib/credit-codes.js";

// 코드가 우연히 겹치면(확률 ~10^-12) 묶음 전체를 새 코드로 다시 뽑는다.
const INSERT_TRIES = 3;

export const POST = withUser(async (req, _ctx, user) => {
  const body = await req.json().catch(() => ({}));
  const batch = typeof body?.batch === "string" ? body.batch.trim() : "";
  const rows = Array.isArray(body?.rows) ? body.rows : null;

  if (!batch) return Response.json({ error: "묶음 이름을 적어 주세요" }, { status: 400 });
  if (!rows || rows.length === 0) return Response.json({ error: "만들 행이 없어요" }, { status: 400 });
  if (rows.length > MAX_CODE_ROWS) {
    return Response.json({ error: `한 번에 ${MAX_CODE_ROWS.toLocaleString()}행까지 만들 수 있어요` }, { status: 400 });
  }
  // ★ 문자열 "1000" 도 막는다 — 화면이 숫자로 바꿔 보내야 한다. 조용히 받아 주면 "1,000" 같은 값이 NaN 으로 샌다.
  const bad = rows.findIndex((r) => !Number.isInteger(r?.credits) || r.credits <= 0);
  if (bad >= 0) {
    return Response.json({ error: `${bad + 1}번째 행의 크레딧이 양의 정수가 아니에요` }, { status: 400 });
  }

  const store = getStore();
  for (let t = 0; t < INSERT_TRIES; t += 1) {
    const made = rows.map((r) => ({
      code: generateCode(randomInt),
      amount_credits: r.credits,
      batch,
      meta: r.meta && typeof r.meta === "object" && !Array.isArray(r.meta) ? r.meta : {},
      created_by: user.id,
    }));
    if (new Set(made.map((m) => m.code)).size !== made.length) continue;
    if (await store.insertCreditCodes(made)) {
      return Response.json({ codes: made.map(({ code, amount_credits, meta }) => ({ code, amount_credits, meta })) });
    }
  }
  return Response.json({ error: "코드를 만들지 못했어요 — 다시 눌러 주세요" }, { status: 500 });
}, { adminOnly: true });

export const GET = withUser(async () => {
  const store = getStore();
  const codes = await store.listCreditCodes();
  const ids = [...new Set(codes.map((c) => c.redeemed_by).filter(Boolean))];
  const profiles = ids.length ? await store.findProfiles(ids) : new Map();
  return Response.json({
    codes: codes.map((c) => {
      const p = c.redeemed_by ? profiles.get(c.redeemed_by) : null;
      return {
        ...c,
        redeemer: p ? { email: p.email ?? null, display_name: p.display_name ?? null, status: p.status ?? null } : null,
      };
    }),
  });
}, { adminOnly: true });
