import { sweepBakingProjects } from "../../../../lib/collect-sweep.js";

// ★★★ 굽는 편을 **사람 없이** 걷는 문 (2026-09-10 사장님 요청: "접수증을 받으면 일정
//   시간 즉 1분마다 우리가 확인 요청을 보내서 받아오는 방식은 불가능해?").
//
// 무엇이 망가져 있었나: 접수는 큐로 즉시 끝나고 결과는 수거가 이어받는데, 그 수거를
// 부르는 자리가 **사람이 화면을 열었을 때뿐**이었다. 굽기는 10분이 걸린다 — 그 사이
// 창을 닫으면 아무도 안 걷는다. 실물로 셋이 그렇게 앉아 있었다(09-10 실측):
//   reel 14fd0ce0 · ad 0603d9bf(09-08부터) · ad 26cfd4a2(09-04부터) — 전부 fal COMPLETED.
// ⚠️ fal 에는 **요청 목록 API 가 없다**(09-10 실측 405/404). 접수증을 놓치면 되찾을 길이
//   없으므로, 이 문은 "접수증이 반드시 쓰이게 하는" 장치다.
//
// ★ 판정은 여기 없다 — lib/collect-sweep.js 가 쥔다. 라우트에 두면 값으로 못 잰다
//   (lib/archive/video.js 를 화면 밖으로 뺀 것과 같은 이유).
//
// ★ 상한 300초 — 광고 마무리(내려받기·자막 굽기·저장)가 그 안에서 돈다. 쓸기가 한 회차에
//   **한 편만** 마무리하므로 1분 간격과 겹쳐도 쌓이지 않는다(FINISH_PER_RUN).
export const maxDuration = 300;

// ★★★ 이 문은 **로그인 벽 밖**에 있다(Vercel 크론에는 사람이 없다 — lib/auth/paths.js 의
//   PUBLIC_PATHS 에 이 경로 하나가 들어 있다). 그러니 문을 지키는 것은 비밀 하나뿐이다.
//
// ★ **비밀이 없으면 닫는다.** env 를 빠뜨린 배포에서 조용히 열리면, 남의 편을 fal 에
//   실어 나르는 문이 그대로 공개된다. 이 저장소의 규칙과 같다 — 모르면 안전한 쪽으로
//   떨어진다(lib/fake.js 는 모르는 값을 "진짜, 돈이 나감"으로 본다).
// ★ Vercel 이 `Authorization: Bearer $CRON_SECRET` 을 실어 보낸다.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "크론 비밀이 필요해요" }, { status: 401 });
  }

  const out = await sweepBakingProjects();
  // 무엇을 했는지 남긴다 — 크론에는 결과를 볼 사람이 없어서, Vercel 로그가 유일한 창이다.
  console.log("[크론 수거]", JSON.stringify(out));
  return Response.json(out);
}
