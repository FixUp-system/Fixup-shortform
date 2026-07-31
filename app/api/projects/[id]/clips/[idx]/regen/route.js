import { regenClip } from "../../../../../../../lib/pipeline";

// TEMP(Task 7 에서 requireUser 로 교체) — 인증이 붙기 전까지의 자리표시자.
// 이 상수가 남아 있으면 Task 7 이 안 끝난 것이다.
const TEMP_OWNER = process.env.SHOTFORM_TEMP_OWNER || "00000000-0000-0000-0000-000000000000";

export async function POST(req, { params }) {
  const { id, idx } = await params;
  try {
    const cut = await regenClip(id, TEMP_OWNER, Number(idx));
    return Response.json({ cut });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
