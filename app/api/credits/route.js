// GET /api/credits — 내 잔액(크레딧)과 게이트 적용 여부.
// 화면 진입 때 한 번 읽는다. 편수(videos_left)는 폐지됐다 — 정가가 길이마다 달라
// "N편 남음"이 거짓말이 된다. 화면은 정가(lib/pricing.js)를 스스로 알고 비교한다.
import { withUser } from "../../../lib/auth/require-user.js";
import { balanceFor, creditsEnabled } from "../../../lib/charges.js";
import { fakeFal } from "../../../lib/fake.js";

export const GET = withUser(async (_req, _ctx, user) => {
  return Response.json({
    balance: await balanceFor(user.id),
    // 크레딧 게이트가 지금 적용되는가. 시작 게이트가 `if (!fakeFal())` 로 가짜 모드를
    // 건너뛰므로 화면도 같은 규칙을 봐야 한다 — 판정을 두 벌로 두면 언젠가 어긋난다
    // (실제로 어긋났다: 0원 관통인데 화면이 먼저 막아 서버의 202 를 볼 수 없었다).
    // 화면은 SHOTFORM_FAKE 를 직접 볼 수 없다(서버 env 이고 NEXT_PUBLIC_ 이 아니다).
    gated: !fakeFal() && creditsEnabled(),
  });
});
