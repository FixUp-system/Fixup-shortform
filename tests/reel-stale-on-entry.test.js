// 낡음 판정을 **서버가 보낸다** — 진입 라우트도 폴링과 같은 말을 한다 (2026-09-11).
//
// ★★★ 이 판이 여는 문: 폴링 응답에서 **각인(`image.of`·`video.of`)을 빼는 것**.
//   각인은 폴링 응답 26.7KB 중 22.5KB(컷 정보)의 90%다 — 빼면 한 편에 9.5MB → 2.5MB.
//   그런데 **그냥 빼면 낡음 배지가 조용히 사라진다.** 판정이 각인을 빼기 계산의
//   한쪽 항으로 쓰기 때문이다(`lib/reel/steps.js` 의 isReelClipStale):
//       (cut.video.of || "") !== (cut.clip_prompt || "")
//   각인이 없으면 `"" !== ""` 가 되어 **언제나 '안 낡음'** 이다. 오류도 안 나고 화면도
//   멀쩡한데 배지만 영영 안 뜬다 — **아무도 신고하지 않는 종류의 고장**이다.
//
// ★ 그래서 순서가 이것이다: **판정을 먼저 옮기고, 각인은 맨 마지막에 뺀다.**
//   이 파일은 그 첫 단계를 고정한다 — 진입 라우트가 `cuts[].stale` 을 싣는 것.
//   ⚠️ **지금은 칸을 더하기만 한다.** 각인은 그대로 두고, 화면도 아직 안 고친다.
//   칸을 더하는 것은 소비자에게 안전하다(모르는 칸은 무시된다). 위험한 것은 빼는 쪽이다.
//
// ★★ 판정 함수는 **여전히 하나**다(isReelClipStale). 두 라우트가 같은 함수를 부른다 —
//   이 저장소의 규칙(같은 값을 두 군데 두지 않는다)을 그대로 지킨다. 라우트가 자기
//   판정을 손으로 적으면 그 순간 두 벌이 되고, 한쪽이 조용히 낡는다.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { createProject, updateProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { resetMemoryStore } from "../lib/store/memory.js";
import { isReelClipStale } from "../lib/reel/steps.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET as REEL_GET } from "../app/api/reel/[id]/route.js";

const U = "00000000-0000-4000-8000-00000000ca11";

const headers = (uid) =>
  new Headers({ [USER_HEADER]: uid, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" });
const req = (uid) => ({ headers: headers(uid) });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

// ④에서 아무것도 안 고친 컷 — 구울 때의 각인과 지금 값이 같다.
const FRESH = {
  idx: 0,
  clip_prompt: "커피를 내리는 손",
  image: { url: "https://fal/img0.png", of: "커피 잔 클로즈업" },
  video: { url: "https://fal/cut0.mp4", of: "커피를 내리는 손", imageOf: "https://fal/img0.png" },
};
// ④에서 프롬프트를 고친 뒤 아직 안 구운 컷 — 화면에 배지가 떠야 하는 자리다.
const STALE = {
  idx: 1,
  clip_prompt: "원두를 붓는 손",
  image: { url: "https://fal/img1.png", of: "원두 클로즈업" },
  video: { url: "https://fal/cut1.mp4", of: "커피를 내리는 손", imageOf: "https://fal/img1.png" },
};

const makeReel = async (cuts) => {
  const p = await runWithActor(U, () =>
    createProject({ ownerId: U, kind: "reel", material: { text: "원두 광고", photos: [] }, settings: {} })
  );
  await runWithActor(U, () => updateProject(p.id, U, (doc) => ({ ...doc, cuts })));
  return p.id;
};

const readEntry = async (id) => {
  const res = await REEL_GET(req(U), ctx(id));
  expect(res.status, "진입 라우트가 안 열렸다").toBe(200);
  return res.json();
};

beforeEach(() => resetMemoryStore());

describe("함정 자체를 판으로 — 각인이 없으면 판정이 거짓말을 한다", () => {
  // ★ 이 판은 고칠 대상이 아니라 **왜 순서를 지켜야 하는지의 근거**다.
  //   여기가 초록인 동안에는 "폴링에서 각인만 빼면 된다"가 언제나 틀린 말이다.
  //
  // ★★★ 2026-09-11 실측이 인계 문서를 정정했다 — **틀리는 방향이 둘이고, 무엇을
  //   빼느냐로 갈린다.** 문서는 "빈칸 vs 빈칸 → 항상 안 낡음" 하나만 적고 있었다.
  it("★★★ 계획대로 다 빼면 — 낡았는데도 '안 낡음'이다 (조용한 고장)", () => {
    expect(isReelClipStale(STALE), "각인이 있으면 낡음을 잡는다").toBe(true);

    // 화면이 실제로 읽는 칸 넷만 남긴 모양(idx·image.url·video.url·stale).
    // clip_prompt 도 각인도 없으니 `"" !== ""` → 언제나 '안 낡음'이다.
    const 최종모양 = { idx: STALE.idx, image: { url: STALE.image.url }, video: { url: STALE.video.url } };
    expect(
      isReelClipStale(최종모양),
      "다 뺐는데도 낡음을 잡았다면 이 파일의 전제가 틀린 것이다"
    ).toBe(false);
  });

  it("★★★ 각인만 빼고 clip_prompt 를 남기면 — 반대로 **항상 켜진다**", () => {
    // ⚠️ 절반만 적용했을 때의 모습이다. `"" !== "원두를 붓는 손"` 이라 전부 낡음이 된다.
    //   조용한 고장은 아니지만(눈에 보인다) **멀쩡한 컷에 재생성을 권하는 화면**이 되고,
    //   그 버튼은 돈이 나가는 자리다. 절반만 배포하는 일이 없어야 하는 이유다.
    const 절반 = { ...STALE, video: { url: STALE.video.url } };
    expect(isReelClipStale(절반), "절반만 뺐을 때의 방향이 바뀌었다").toBe(true);

    const 안낡은컷_절반 = { ...FRESH, video: { url: FRESH.video.url } };
    expect(
      isReelClipStale(안낡은컷_절반),
      "★ 멀쩡한 컷까지 낡았다고 말한다 — 이것이 거짓 양성이다"
    ).toBe(true);
  });

  it("★★ 그래서 화면의 보험은 폴링에서 각인이 사라지는 순간 어느 쪽으로든 틀린다", () => {
    // app/reel/[id]/video/page.js 의 `c.stale ?? isReelClipStale(c)` 가 그 보험이다.
    // 서버 판정(stale)이 없으면 보험이 도는데, 그 보험이 보는 것이 바로 각인이다.
    const 최종모양 = { idx: STALE.idx, image: { url: STALE.image.url }, video: { url: STALE.video.url } };
    const 보험 = 최종모양.stale ?? isReelClipStale(최종모양);
    expect(보험, "보험이 낡음을 잡아냈다면 각인이 아직 실려 있는 것이다").toBe(false);

    // 서버가 판정을 실어 보내면 보험이 아예 안 돈다 — 그것이 이 회차가 여는 문이다.
    const 서버판정있음 = { ...최종모양, stale: true };
    expect(서버판정있음.stale ?? isReelClipStale(서버판정있음), "서버 판정이 안 이긴다").toBe(true);
  });
});

describe("진입 라우트가 판정을 싣는다", () => {
  it("★★★ cuts 마다 stale 이 온다 — 낡은 컷은 true, 멀쩡한 컷은 false", async () => {
    const id = await makeReel([FRESH, STALE]);
    const doc = await readEntry(id);

    expect(doc.cuts, "cuts 가 통째로 사라졌다").toHaveLength(2);
    expect(doc.cuts[0].stale, "안 낡은 컷이 낡았다고 나온다").toBe(false);
    expect(doc.cuts[1].stale, "낡은 컷에 판정이 안 실렸다").toBe(true);
  });

  it("★★★ 판정은 isReelClipStale 하나다 — 라우트가 자기 판정을 적지 않는다", async () => {
    const id = await makeReel([FRESH, STALE]);
    const doc = await readEntry(id);

    for (const c of doc.cuts) {
      expect(
        c.stale,
        `컷 ${c.idx} 의 판정이 lib 와 다르다 — 라우트가 판정을 따로 적었다`
      ).toBe(isReelClipStale(c));
    }
  });

  it("★★ 각인은 **그대로 남는다** — 보관함 상세와 ③그림 화면이 읽는다", async () => {
    // app/archive/[id]/page.js:178 · app/reel/[id]/images/page.js:126 이 image.of 를 읽는다.
    // 둘 다 이 진입 라우트에서 받으므로, 여기서 각인을 빼면 그 화면들이 죽는다.
    const id = await makeReel([FRESH, STALE]);
    const doc = await readEntry(id);

    expect(doc.cuts[0].image.of, "그림의 각인이 사라졌다").toBe("커피 잔 클로즈업");
    expect(doc.cuts[1].video.of, "영상의 각인이 사라졌다").toBe("커피를 내리는 손");
  });

  it("★ 컷의 다른 칸을 하나도 안 잃는다 — 더하기만 한다", async () => {
    const id = await makeReel([FRESH]);
    const doc = await readEntry(id);

    const got = doc.cuts[0];
    expect(got.idx).toBe(0);
    expect(got.clip_prompt).toBe("커피를 내리는 손");
    expect(got.image.url).toBe("https://fal/img0.png");
    expect(got.video.url).toBe("https://fal/cut0.mp4");
    expect(got.video.imageOf).toBe("https://fal/img0.png");
  });

  it("★ 컷이 없는 문서에는 cuts 를 만들어 내지 않는다", async () => {
    const p = await runWithActor(U, () =>
      createProject({ ownerId: U, kind: "reel", material: { text: "아직 시나리오 전", photos: [] }, settings: {} })
    );
    const doc = await readEntry(p.id);
    // 없던 칸이 빈 배열로 생기면 "컷이 0개다"와 "아직 단계에 안 왔다"가 뭉개진다.
    expect(doc.cuts === undefined || doc.cuts.length === 0, "없던 cuts 가 생겼다").toBe(true);
  });
});

// ── 2단계 — 화면이 서버 판정만 본다 (보험을 걷는다) ─────────────────────────────
//
// ★★★ 보험을 걷을 수 있는 **전제**가 있다: 두 문이 **다** 판정을 실어 보낼 것.
//   진입은 1단계에서 실었고 폴링은 09-11 에 이미 싣고 있다. 그 전제를 먼저 잰다 —
//   전제가 깨진 채 보험만 걷으면 배지가 통째로 사라진다.
//
// ⚠️ 이 저장소의 화면 계약은 **소스 문자열**로 잰다. 그래서 주석을 걷은 사본을 봐야
//   한다 — 주석에 남은 낱말에 판이 걸려 조용히 통과한 적이 있다(CLAUDE.md 함정).
describe("2단계 — ⑤영상 화면이 서버 판정만 본다", () => {
  const read = (p) => readFileSync(p, "utf8");
  const strip = (t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  const VIDEO_PAGE = "app/reel/[id]/video/page.js";
  const ENTRY_ROUTE = "app/api/reel/[id]/route.js";
  const POLL_ROUTE = "app/api/reel/[id]/status/route.js";

  it("★★★ 전제 — 두 문이 **다** stale 을 싣는다", () => {
    expect(strip(read(ENTRY_ROUTE)), "진입 라우트가 판정을 안 싣는다").toMatch(/stale:\s*isReelClipStale\(/);
    expect(strip(read(POLL_ROUTE)), "폴링 라우트가 판정을 안 싣는다").toMatch(/stale:\s*isReelClipStale\(/);
  });

  it("★★★ 화면이 배지를 c.stale 로 그린다", () => {
    expect(strip(read(VIDEO_PAGE)), "화면이 서버 판정을 안 본다").toMatch(/c\.stale\s*&&/);
  });

  it("★★★ 보험이 걷혔다 — 화면이 각인을 직접 재지 않는다", () => {
    // 이 한 줄이 각인을 붙잡고 있던 마지막 소비자다. 걷혀야 3단계(각인 제거)가 안전하다.
    const c = strip(read(VIDEO_PAGE));
    expect(c, "화면이 아직 isReelClipStale 을 부른다 — 3단계로 가면 안 된다").not.toMatch(/isReelClipStale\s*\(/);
    expect(c, "쓰지 않는 import 가 남았다").not.toMatch(/import\s*\{[^}]*isReelClipStale/);
  });
});

// ── 3단계 — 폴링이 각인을 안 싣는다 (9.5MB → 2.5MB) ──────────────────────────────
//
// ★★★ 여기가 실제로 용량을 줄이는 자리다. 앞 두 단계가 **판정을 서버로 옮겨 놨기
//   때문에만** 안전하다 — 화면은 이제 `c.stale` 만 보고 각인을 직접 재지 않는다.
//   ⚠️ 2단계를 되돌리면 이 단계가 **조용히 틀린다**(배지가 안 뜬다). 그래서 2단계의
//     판과 이 판이 같은 파일에 있다 — 하나를 지우려는 사람이 나머지를 보게 된다.
//
// ★ 싣는 칸은 **화면이 실제로 읽는 넷**뿐이다: idx · image.url · video.url · stale.
//   (2026-09-11 전수 확인: app/reel/[id]/video/page.js 가 컷에서 읽는 것이 이 넷이다.)
import { GET as REEL_STATUS } from "../app/api/reel/[id]/status/route.js";
import { reelBakeCounts } from "../lib/reel/oneshot.js";

describe("3단계 — 폴링 응답에서 각인이 빠진다", () => {
  const readStatus = async (id) => {
    const res = await REEL_STATUS(req(U), ctx(id));
    expect(res.status, "폴링 라우트가 안 열렸다").toBe(200);
    return res.json();
  };

  it("★★★ 각인이 안 온다 — image.of · video.of · imageOf", async () => {
    const id = await makeReel([FRESH, STALE]);
    const st = await readStatus(id);

    for (const c of st.cuts) {
      expect(c.image?.of, `컷 ${c.idx} 에 그림 각인이 실렸다`).toBeUndefined();
      expect(c.video?.of, `컷 ${c.idx} 에 영상 각인이 실렸다`).toBeUndefined();
      expect(c.video?.imageOf, `컷 ${c.idx} 에 그림 각인 대조값이 실렸다`).toBeUndefined();
    }
  });

  it("★★★ 연출칸(clip_prompt)도 안 온다 — 화면이 안 읽는다", async () => {
    // ⚠️ 이것을 남겨 두면 방향이 **반대로** 틀린다(위 「각인만 빼고…」 판 참고):
    //   각인은 없는데 clip_prompt 가 있으면 `"" !== "…"` 라 전부 낡음이 된다.
    const id = await makeReel([FRESH, STALE]);
    const st = await readStatus(id);
    for (const c of st.cuts) {
      expect(c.clip_prompt, `컷 ${c.idx} 에 연출칸이 실렸다`).toBeUndefined();
    }
  });

  it("★★★ 판정은 그대로 온다 — 이것이 각인을 대신한다", async () => {
    const id = await makeReel([FRESH, STALE]);
    const st = await readStatus(id);

    expect(st.cuts[0].stale, "안 낡은 컷").toBe(false);
    expect(st.cuts[1].stale, "낡은 컷 — 배지가 떠야 하는 자리다").toBe(true);
  });

  it("★★★ 화면이 읽는 칸 넷은 다 온다 — idx · image.url · video.url · stale", async () => {
    const id = await makeReel([FRESH, STALE]);
    const st = await readStatus(id);

    const c = st.cuts[1];
    expect(c.idx).toBe(1);
    expect(c.image.url).toBe("https://fal/img1.png");
    expect(c.video.url).toBe("https://fal/cut1.mp4");
    expect(c.stale).toBe(true);
  });

  it("★★ 진입 라우트는 각인을 **그대로** 싣는다 — 두 문이 다르다는 것을 못 박는다", async () => {
    // 같은 이름의 컷이 두 모양이 된다. 이것이 이 회차가 감수한 대가다 —
    // 화면은 **두 모양 다에 있는 칸만** 써야 한다. 코드로는 못 막고 이 판으로 막는다.
    const id = await makeReel([FRESH, STALE]);
    const entry = await readEntry(id);
    const poll = await readStatus(id);

    expect(entry.cuts[1].video.of, "진입에서 각인이 사라졌다 — 보관함이 죽는다").toBe("커피를 내리는 손");
    expect(poll.cuts[1].video.of, "폴링에 각인이 남았다").toBeUndefined();
    expect(entry.cuts[1].stale, "두 문의 판정이 갈렸다").toBe(poll.cuts[1].stale);
  });

  it("★★★ 좁힌 컷으로도 진척 세기가 같다 — reelBakeCounts 가 폴링 컷을 받는다", async () => {
    // app/reel/[id]/video/page.js:128 이 `live.cuts` 를 이 함수에 그대로 넘긴다.
    // isCutDone 이 `c.video` 의 **존재**를 보므로 url 만 남겨도 값이 같아야 한다.
    const id = await makeReel([FRESH, STALE]);
    const entry = await readEntry(id);
    const poll = await readStatus(id);

    const 문서로 = reelBakeCounts(entry, entry.cuts);
    const 폴링으로 = reelBakeCounts(entry, poll.cuts);
    expect(폴링으로, "좁힌 컷에서 진척 수가 달라졌다").toEqual(문서로);
    expect(폴링으로.done, "둘 다 구워진 컷이다").toBe(2);
  });
});
