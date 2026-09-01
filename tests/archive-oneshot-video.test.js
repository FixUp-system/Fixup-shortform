// **구운 영상이 보관함에 안 뜬다** (2026-09-01 사장님 지적).
//
// ★★★ 실측이 이 파일을 만들었다. 단계별로 구운 편이 **한 편도** 보관함에 안 떴다
//   (프로젝트 8편 전부 `render.url` 없음). 원클릭은 멀쩡히 떴다 — 그쪽은 굽자마자
//   `videos[0]` 에 넣기 때문이다.
//
// ★★ 원인은 **보는 자리가 하나 모자란 것**이다. 목록은 `doc.render.url`(합성본)과
//   `doc.videos[0]`(광고)만 보는데, 단계별 통짜 결과는 `cuts[0].video.url` 에 앉는다.
//   합성("이대로 완성하기")은 **수동**이라, 굽기만 하고 완성 화면에 안 들어가면
//   영상이 있는데도 카드에 그림만 뜨고 "영상" 딱지가 안 붙는다.
//
// ★ film 이 2026-08-19 에 **같은 구멍**을 밟았다(tests/film-archive.test.js ②).
//   그때 `filmVideoUrlOf` 로 풀었으므로 여기서도 헬퍼 하나로 푼다 — 새 장치를 안 만든다.
//
// ★★ **컷별 조각은 뜨면 안 된다.** 통짜는 그 한 편이 곧 완성본이지만(`whole: true`),
//   컷별의 `cuts[0]` 은 여러 조각 중 첫 조각일 뿐이라 그것을 완성본으로 보여 주면
//   거짓말이 된다. 가르는 표시가 `whole` 이다(lib/reel/pipeline.js 가 찍는다).
import { describe, it, expect, beforeEach } from "vitest";
import { createProject, updateProject, listProjects } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { resetMemoryStore } from "../lib/store/memory.js";
import { reelWholeVideoUrlOf } from "../lib/reel/doc.js";

const U = "00000000-0000-4000-8000-0000000000e7";

const makeReel = async (patch) => {
  const p = await runWithActor(U, () =>
    createProject({ ownerId: U, kind: "reel", material: { text: "통새우 볶음밥", photos: [] }, settings: {} })
  );
  if (patch) await runWithActor(U, () => updateProject(p.id, U, patch));
  return p;
};
const rowOf = async (id) => (await runWithActor(U, () => listProjects(U))).find((r) => r.id === id);

const WHOLE = { url: "https://fal/whole.mp4", seconds: 15, whole: true };
const PIECE = { url: "https://fal/cut0.mp4", seconds: 3 };

describe("판정 하나 — reelWholeVideoUrlOf", () => {
  it("★★★ 통짜면 그 주소를 준다", () => {
    expect(reelWholeVideoUrlOf({ cuts: [{ video: WHOLE }] })).toBe("https://fal/whole.mp4");
  });

  it("★★ 컷별 조각이면 안 준다 — 첫 조각을 완성본이라 부르면 거짓말이다", () => {
    expect(reelWholeVideoUrlOf({ cuts: [{ video: PIECE }, { video: { url: "x" } }] })).toBeNull();
  });

  it("★ 영상이 없으면 null 이다", () => {
    expect(reelWholeVideoUrlOf({ cuts: [{ image: { url: "i" } }] })).toBeNull();
    expect(reelWholeVideoUrlOf({})).toBeNull();
    expect(reelWholeVideoUrlOf(null)).toBeNull();
  });
});

describe("보관함 목록이 통짜를 안다", () => {
  beforeEach(() => resetMemoryStore());

  it("★★★ 굽기만 해도 카드에 영상이 뜬다 — 그 전에는 null 이었다", async () => {
    const p = await makeReel((d) => ({ ...d, cuts: [{ idx: 0, video: WHOLE }] }));
    expect((await rowOf(p.id)).video_url).toBe("https://fal/whole.mp4");
  });

  it("★★ 컷별은 안 뜬다 — 아직 이어 붙이기 전이라 안 뜨는 것이 맞다", async () => {
    const p = await makeReel((d) => ({ ...d, cuts: [{ idx: 0, video: PIECE }, { idx: 1, video: { url: "y" } }] }));
    expect((await rowOf(p.id)).video_url).toBeNull();
  });

  it("★★ 합성본이 있으면 그쪽이 이긴다 — 자막 태운 편이 진짜 완성본이다", async () => {
    const p = await makeReel((d) => ({
      ...d, cuts: [{ idx: 0, video: WHOLE }], render: { url: "/api/renders/x.mp4" },
    }));
    expect((await rowOf(p.id)).video_url).toBe("/api/renders/x.mp4");
  });

  it("★ 그림은 예전 그대로다 — 썸네일 자리를 안 건드렸다", async () => {
    const p = await makeReel((d) => ({ ...d, cuts: [{ idx: 0, image: { url: "https://fal/i.png" }, video: WHOLE }] }));
    const r = await rowOf(p.id);
    expect(r.image_url).toBe("https://fal/i.png");
    expect(r.video_url).toBe("https://fal/whole.mp4");
  });

  it("★ 광고 카드는 안 바뀐다", async () => {
    const p = await runWithActor(U, () =>
      createProject({ ownerId: U, kind: "ad", material: { text: "광고", photos: [] }, settings: {} })
    );
    await runWithActor(U, () => updateProject(p.id, U, (d) => ({ ...d, videos: [{ url: "/ad.mp4" }] })));
    expect((await rowOf(p.id)).video_url).toBe("/ad.mp4");
  });
});

// **상세 화면도 같은 것을 봐야 한다** (2026-09-01 사장님 지적: 카드는 뜨는데 눌러 들어가면
// "아직 완성본이 없어요"가 떴다).
//
// ★★★ 실측으로 **두 자리가 정반대로 어긋나 있었다**(단계별 18편):
//   · 합성본은 `doc.reel.video.url` 에 산다(4편) — **상세는 봤고 목록은 못 봤다**
//     (목록 SQL 이 `doc->render->>url` 을 읽는데 그 자리는 종류 없는 옛 문서의 것이다).
//   · 통짜 클립은 `cuts[0].video` 에 산다(10편) — **목록은 봤고(앞의 수정) 상세는 못 봤다**.
//   한쪽만 고치면 반대쪽이 남는다. 그래서 판정을 한 벌로 만든다.
//
// ★ lib/archive/video.js 는 "import 가 없다"를 성질로 적어 두었다. 그 뜻은 **화면이 그대로
//   부를 수 있어야 한다**(사슬 끝에 fs 가 닿으면 안 된다)이고, lib/reel/doc.js 도 import 0 개라
//   그 성질이 깨지지 않는다. 규칙을 두 벌로 베끼는 쪽이 이 저장소가 더 크게 겪은 사고다.
import { archiveVideoUrl } from "../lib/archive/video.js";

const reelDoc = (extra) => ({ kind: "reel", ...extra });

describe("상세 화면 판정 — archiveVideoUrl", () => {
  it("★★★ 통짜 클립만 있어도 완성본이다 — 이것이 '아직 완성본이 없어요'의 원인이었다", () => {
    expect(archiveVideoUrl(reelDoc({ cuts: [{ video: WHOLE }] }))).toBe("https://fal/whole.mp4");
  });

  it("★★ 합성본이 있으면 그쪽이 이긴다 — 자막 태운 편이 진짜 완성본이다", () => {
    const doc = reelDoc({ reel: { video: { url: "/api/renders/r.mp4" } }, cuts: [{ video: WHOLE }] });
    expect(archiveVideoUrl(doc)).toBe("/api/renders/r.mp4");
  });

  it("★★ 컷별 조각은 완성본이 아니다 — 아직 이어 붙이기 전이다", () => {
    expect(archiveVideoUrl(reelDoc({ cuts: [{ video: PIECE }, { video: { url: "y" } }] }))).toBeNull();
  });

  it("★ 광고·film·옛 문서는 예전 그대로다", () => {
    expect(archiveVideoUrl({ kind: "ad", videos: [{ url: "/ad.mp4" }] })).toBe("/ad.mp4");
    expect(archiveVideoUrl({ kind: "film", films: { order: { video: { url: "/f.mp4" } } } })).toBe("/f.mp4");
    expect(archiveVideoUrl({ render: { url: "/old.mp4" } })).toBe("/old.mp4");
    expect(archiveVideoUrl(null)).toBeNull();
  });

  it("★★ 언제나 문자열이거나 null 이다 — 이 파일이 생긴 이유다(객체를 내면 재생이 죽는다)", () => {
    for (const d of [reelDoc({ cuts: [{ video: WHOLE }] }), reelDoc({}), null]) {
      const v = archiveVideoUrl(d);
      expect(v === null || typeof v === "string").toBe(true);
    }
  });
});

describe("목록도 합성본 자리를 본다 — 반대쪽 어긋남", () => {
  beforeEach(() => resetMemoryStore());

  it("★★★ doc.reel.video.url 만 있어도 카드에 영상이 뜬다", async () => {
    const p = await makeReel((d) => ({ ...d, reel: { ...d.reel, video: { url: "/api/renders/z.mp4" } } }));
    expect((await rowOf(p.id)).video_url).toBe("/api/renders/z.mp4");
  });

  it("★★ 합성본이 통짜 클립을 이긴다 — 두 자리가 같은 순서를 쓴다", async () => {
    const p = await makeReel((d) => ({
      ...d, cuts: [{ idx: 0, video: WHOLE }], reel: { ...d.reel, video: { url: "/api/renders/z.mp4" } },
    }));
    expect((await rowOf(p.id)).video_url).toBe("/api/renders/z.mp4");
  });
});
