// 레퍼런스까지 포함한 **정확한 꼬리**를 화면에 준다.
//
// 왜 라우트가 필요한가: 레퍼런스 절(`Attached reference images, in order: …`·사진 지시)은
// resolveCutRefs → readRefBytes 를 거쳐야 알 수 있고, 그 판정은 `fs`·Storage 를 끈다 —
// 화면("use client")이 부를 수 없다. 그래서 ④이미지의 [전문 복사]는 지금까지 그 절이
// **빠진** 프롬프트를 복사했다. 밖에서 돌려 보면 우리 결과와 다르고, 왜 다른지 알 수 없다.
//
// ★ 왜 꼬리만 주는가: 본문은 사장님이 화면에서 고치는 중일 수 있고(아직 저장 안 한 글자),
//   꼬리는 본문에 딸리지 않는다(buildImagePrompt = 본문 + 공통지시 + 꼬리). 그래서 화면이
//   자기 본문 + 서버 꼬리를 이으면 "저장하면 나갈 글자"가 정확히 나온다. 전문을 주면
//   사장님이 방금 고친 본문이 서버의 옛 본문으로 덮인다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, updateProject } from "../lib/projects.js";
import { buildImagePrompt, promptBodyOf } from "../lib/cuts.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const { GET } = await import("../app/api/projects/[id]/cuts/[idx]/prompt/route.js");

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const req = (user = A) => ({ headers: new Headers({ [USER_HEADER]: user, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" }) });
const ctx = (id, idx) => ({ params: Promise.resolve({ id, idx: String(idx) }) });

// 사장님이 올린 사진을 레퍼런스로 쓰는 컷 하나.
async function projectWithPhotoRef({ withBytes }) {
  const p = await createProject({
    ownerId: A,
    settings: { target_seconds: 30, aspect_ratio: "9:16" },
    material: { text: "자료", photos: [{ id: "p1", url: "/api/uploads/shoe.png" }] },
  });
  if (withBytes) await getStore().putObject("uploads", "shoe.png", Buffer.from("PNG"), "image/png");
  await updateProject(p.id, A, (proj) => ({
    ...proj,
    status: "images",
    cuts: [{ idx: 0, sentence: "가", seconds: 3, shows: "a shoe on concrete", ref_ids: ["p1"] }],
  }));
  return p;
}

describe("GET 컷 프롬프트 꼬리", () => {
  beforeEach(() => resetMemoryStore());

  it("★ 레퍼런스 사진 절을 싣는다 — 화면이 만들 수 없는 바로 그 절이다", async () => {
    const p = await projectWithPhotoRef({ withBytes: true });

    const res = await GET(req(), ctx(p.id, 0));
    expect(res.status ?? 200).toBe(200);
    const got = await res.json();

    // 화면이 refs 없이 만드는 꼬리보다 **길다**. 그 차이가 이 라우트의 존재 이유다.
    expect(got.tail.length, "refs 없는 꼬리와 같다 — 레퍼런스 절이 안 실렸다")
      .toBeGreaterThan(got.tail_without_refs.length);
    expect(got.missing, "못 읽은 레퍼런스가 있다고 한다").toBe(0);
    expect(got.refs).toHaveLength(1);
    expect(got.refs[0].kind).toBe("thing");
  });

  it("★ 본문과 이으면 실제로 나가는 프롬프트가 된다", async () => {
    const p = await projectWithPhotoRef({ withBytes: true });
    const res = await GET(req(), ctx(p.id, 0));
    const { tail } = await res.json();

    // 파이프라인이 만드는 것과 글자 그대로 같아야 한다(같은 refs 로 조립한 것).
    const { getProject } = await import("../lib/projects.js");
    const proj = await getProject(p.id, A);
    const body = promptBodyOf("image", proj.cuts[0], proj);
    const { loadCutRefs } = await import("../lib/cut-refs.js");
    const { refs } = await loadCutRefs(proj.cuts[0], proj);
    expect(body + tail).toBe(buildImagePrompt(proj.cuts[0], proj, refs));
  });

  it("★ 못 읽은 레퍼런스는 꼬리에서도 빠진다 — 그 사실을 알린다", async () => {
    const p = await projectWithPhotoRef({ withBytes: false });

    const got = await (await GET(req(), ctx(p.id, 0))).json();

    // 실제로 나가는 그림에 그 사진이 안 실린다. 꼬리도 그것과 같아야 한다.
    expect(got.tail).toBe(got.tail_without_refs);
    expect(got.missing, "못 읽은 장수를 안 알린다 — 사장님은 사진이 실린 줄 안다").toBe(1);
  });

  it("★ 남의 프로젝트는 없는 것과 같다", async () => {
    const p = await projectWithPhotoRef({ withBytes: true });
    const res = await GET(req(B), ctx(p.id, 0));
    expect(res.status).toBe(404);
  });

  it("★ 없는 컷은 404 다", async () => {
    const p = await projectWithPhotoRef({ withBytes: true });
    const res = await GET(req(), ctx(p.id, 7));
    expect(res.status).toBe(404);
  });
});
