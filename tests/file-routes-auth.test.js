import { describe, it, expect, beforeEach } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { createProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET as getUpload } from "../app/api/uploads/[name]/route.js";
import { GET as getRender } from "../app/api/renders/[name]/route.js";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const as = (id) => new Request("http://localhost/x", {
  headers: { [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" },
});

// 렌더 라우트는 파일명이 곧 프로젝트 id 라 소유자 판정을 getProject 가 한다 —
// upload_owners 같은 별도 원장이 없다. 완성본은 이제 renders 비공개 버킷에 있다
// (lib/compose.js 가 거기에 올린다). ★ 객체를 실제로 심는 이유는 예전에 파일을 심던
// 이유와 같다 — 없으면 getObject 실패가 먼저 404 를 내서, 소유자 검사를 지워도
// 통과하는 "지키는 척하는 테스트"가 된다. 주인이 부르면 200(+내용), 남이 부르면
// 객체가 있는데도 404 여야 진짜 검사다.
async function putRenderObject(projectId, content = "video-bytes") {
  await memoryStore.putObject("renders", `${projectId}.mp4`, Buffer.from(content), "video/mp4");
}

describe("업로드 소유자", () => {
  beforeEach(() => resetMemoryStore());

  it("주인은 받는다", async () => {
    await memoryStore.putObject("uploads", "aaa.jpg", Buffer.from("x"), "image/jpeg");
    await memoryStore.insertUploadOwner("aaa.jpg", A);
    const res = await getUpload(as(A), { params: Promise.resolve({ name: "aaa.jpg" }) });
    expect(res.status).toBe(200);
  });

  it("남은 404 다", async () => {
    await memoryStore.putObject("uploads", "aaa.jpg", Buffer.from("x"), "image/jpeg");
    await memoryStore.insertUploadOwner("aaa.jpg", A);
    const res = await getUpload(as(B), { params: Promise.resolve({ name: "aaa.jpg" }) });
    expect(res.status).toBe(404);
  });

  it("주인 기록이 없는 옛 파일도 404 다 — 열어두지 않는다", async () => {
    await memoryStore.putObject("uploads", "old.jpg", Buffer.from("x"), "image/jpeg");
    const res = await getUpload(as(A), { params: Promise.resolve({ name: "old.jpg" }) });
    expect(res.status).toBe(404);
  });
});

describe("완성본 내려받기", () => {
  beforeEach(() => resetMemoryStore());

  it("주인이 부르면 200 이고 파일 내용이 그대로 온다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    await putRenderObject(p.id, "진짜-영상-바이트");
    const res = await getRender(as(A), { params: Promise.resolve({ name: `${p.id}.mp4` }) });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("진짜-영상-바이트");
  });

  it("파일명이 곧 프로젝트 id 다 — 객체가 있어도 남의 것은 404", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    // 객체가 버킷에 실제로 있다 — 그런데도 막혀야 진짜 소유자 검사다(리뷰 C1).
    // 객체를 안 두면 getObject 실패가 먼저 404 를 내서, 소유자 검사를 지워도
    // 테스트가 통과하는 "지키는 척하는 테스트"가 된다.
    await putRenderObject(p.id, "진짜-영상-바이트");
    const res = await getRender(as(B), { params: Promise.resolve({ name: `${p.id}.mp4` }) });
    expect(res.status).toBe(404);
  });

  it("프로젝트 id 가 아닌 이름은 400 이다", async () => {
    const res = await getRender(as(A), { params: Promise.resolve({ name: "hack.mp4" }) });
    expect(res.status).toBe(400);
  });
});

// ★ 자막 없는 **원본**(-raw)도 같은 라우트로 나간다 — ⑥완성의 미리보기가 그것을 재생하고,
// 그 위에 브라우저가 자막을 그린다. uuid 만 받던 때는 `r`·`w` 가 hex 가 아니라 400 이 나서
// 어떤 프로젝트에서도 미리보기가 안 떴다(자막 적용은 되니 조용히 실패했다).
describe("원본(-raw) 내려받기", () => {
  beforeEach(() => resetMemoryStore());

  const seed = async (ownerId, content = "원본-바이트") => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId });
    await memoryStore.putObject("renders", `${p.id}-raw.mp4`, Buffer.from(content), "video/mp4");
    return p;
  };

  it("주인이 부르면 200 이고 원본 내용이 온다", async () => {
    const p = await seed(A);
    const res = await getRender(as(A), { params: Promise.resolve({ name: `${p.id}-raw.mp4` }) });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("원본-바이트");
  });

  it("남의 원본은 객체가 있어도 404 다 — 완성본과 같은 소유자 검사를 받는다", async () => {
    const p = await seed(A);
    const res = await getRender(as(B), { params: Promise.resolve({ name: `${p.id}-raw.mp4` }) });
    expect(res.status).toBe(404);
  });

  it("-raw 를 흉내 낸 이름은 여전히 400 이다", async () => {
    for (const name of ["hack-raw.mp4", "11111111-1111-1111-1111-111111111111-rawx.mp4"]) {
      const res = await getRender(as(A), { params: Promise.resolve({ name }) });
      expect(res.status, name).toBe(400);
    }
  });
});

// 영상은 볼 때마다 전량이 나간다(개당 8~13MB 실측). 무료 플랜은 저장(1GB)보다
// 전송(5GB/월)이 먼저 차므로, 같은 사람이 다시 볼 때의 전송을 0 으로 만든다.
//
// ★ 각인이 아니라 render.ts 를 ETag 로 쓴다 — 라우트가 이미 getProject 를 부르므로
//   추가 왕복이 없고, 재합성하면 ts 가 갱신되어 캐시가 저절로 무효화된다.
//   (URL 은 /api/renders/<id>.mp4 로 늘 같아서 URL 만으로는 갱신을 알릴 수 없다)
describe("완성본 캐시", () => {
  beforeEach(() => resetMemoryStore());

  const withEtag = (id, etag) => new Request("http://localhost/x", {
    headers: {
      [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
      "if-none-match": etag,
    },
  });

  // render.ts 를 doc 에 심는다 — 합성이 끝나면 lib/pipeline.js 가 이 값을 쓴다
  async function seedRendered(ownerId, ts) {
    const { updateProject } = await import("../lib/projects.js");
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId });
    await updateProject(p.id, ownerId, (d) => ({ ...d, render: { url: `/api/renders/${p.id}.mp4`, ts } }));
    await putRenderObject(p.id, "진짜-영상-바이트");
    return p;
  }

  it("ETag 와 private 캐시 지시를 함께 준다", async () => {
    const p = await seedRendered(A, 1755000000000);
    const res = await getRender(as(A), { params: Promise.resolve({ name: `${p.id}.mp4` }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe('"1755000000000"');
    // ★ private 이어야 한다 — 비공개 영상이 공유 캐시(CDN·프록시)에 남으면 안 된다
    expect(res.headers.get("cache-control")).toMatch(/private/);
  });

  it("같은 ETag 로 다시 부르면 304 이고 본문이 0 바이트다", async () => {
    const p = await seedRendered(A, 1755000000000);
    const res = await getRender(
      withEtag(A, '"1755000000000"'),
      { params: Promise.resolve({ name: `${p.id}.mp4` }) }
    );
    expect(res.status).toBe(304);
    // 이 테스트의 전부다 — 본문이 안 나가야 Storage 전송이 0 이 된다
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  });

  it("재합성해서 ts 가 바뀌면 옛 ETag 는 안 먹는다 — 새 영상이 온다", async () => {
    const p = await seedRendered(A, 1755000000000);
    const { updateProject } = await import("../lib/projects.js");
    await updateProject(p.id, A, (d) => ({ ...d, render: { ...d.render, ts: 1755999999999 } }));
    await putRenderObject(p.id, "새로-만든-영상");

    const res = await getRender(
      withEtag(A, '"1755000000000"'), // 옛 각인
      { params: Promise.resolve({ name: `${p.id}.mp4` }) }
    );
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("새로-만든-영상");
  });

  it("남의 것은 ETag 가 맞아도 404 다 — 캐시가 소유자 검사를 앞지르지 않는다", async () => {
    const p = await seedRendered(A, 1755000000000);
    const res = await getRender(
      withEtag(B, '"1755000000000"'),
      { params: Promise.resolve({ name: `${p.id}.mp4` }) }
    );
    expect(res.status).toBe(404);
  });
});

// ★ 완성본을 함수 본문으로 흘리면 **Vercel 에서 못 내려받는다** — 함수 응답 본문 상한이
// 4.5MB 인데 이 영상은 개당 8~13MB 다(그 라우트 주석의 실측값). 그래서 서명 URL 로 넘긴다:
// 소유자 검사는 함수가 하고, 통과하면 302 로 보내 **본문이 함수를 안 지나간다.**
//
// 저장된 주소(/api/renders/<id>.mp4)는 그대로 둔다 — 문서에 남은 url 이 영구히 유효해야
// 한다는 기존 규약을 지키기 위해서다(서명 URL 을 문서에 저장하지 않는 이유이기도 하다).
describe("완성본 — 서명 URL 로 넘긴다", () => {
  beforeEach(() => resetMemoryStore());

  const mk = async (owner = A) =>
    createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: owner });

  it("저장소가 서명 URL 을 주면 302 로 넘기고 본문은 안 싣는다", async () => {
    const p = await mk();
    await putRenderObject(p.id);
    memoryStore.signedObjectUrl = async () => "https://storage.example/signed?token=x";
    try {
      const res = await getRender(as(A), { params: Promise.resolve({ name: `${p.id}.mp4` }) });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("https://storage.example/signed?token=x");
      expect(Buffer.from(await res.arrayBuffer()).length, "본문이 실렸다").toBe(0);
    } finally {
      delete memoryStore.signedObjectUrl;
    }
  });

  it("★ 소유자 검사는 서명보다 먼저다 — 남의 것은 서명 자체를 안 만든다", async () => {
    const p = await mk();
    await putRenderObject(p.id);
    let asked = 0;
    memoryStore.signedObjectUrl = async () => { asked += 1; return "https://storage.example/signed"; };
    try {
      const res = await getRender(as(B), { params: Promise.resolve({ name: `${p.id}.mp4` }) });
      expect(res.status).toBe(404);
      expect(asked, "남의 것인데 서명을 만들었다").toBe(0);
    } finally {
      delete memoryStore.signedObjectUrl;
    }
  });

  it("서명을 못 만드는 저장소(메모리·로컬)에서는 지금처럼 본문을 흘린다 — 회귀 방어", async () => {
    const p = await mk();
    await putRenderObject(p.id, "진짜-영상-바이트");
    const res = await getRender(as(A), { params: Promise.resolve({ name: `${p.id}.mp4` }) });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("진짜-영상-바이트");
  });

  it("?dl=1 이면 첨부로 받도록 서명한다 — 미리보기는 인라인 그대로", async () => {
    const p = await mk();
    await putRenderObject(p.id);
    const seen = [];
    memoryStore.signedObjectUrl = async (bucket, key, seconds, opts) => {
      seen.push(opts?.download ?? null);
      return "https://storage.example/signed";
    };
    try {
      const url = `http://localhost/api/renders/${p.id}.mp4?dl=1`;
      const req = new Request(url, { headers: as(A).headers });
      await getRender(req, { params: Promise.resolve({ name: `${p.id}.mp4` }) });
      await getRender(as(A), { params: Promise.resolve({ name: `${p.id}.mp4` }) });
      expect(seen[0], "?dl=1 인데 첨부로 서명하지 않았다").toBeTruthy();
      expect(seen[1], "미리보기인데 첨부로 서명했다").toBeFalsy();
    } finally {
      delete memoryStore.signedObjectUrl;
    }
  });

  it("★ 304 판정이 서명보다 앞이다 — 안 바뀐 영상은 서명도 안 만든다(전송 절감 유지)", async () => {
    const p = await mk();
    await putRenderObject(p.id);
    const { getStore } = await import("../lib/store/index.js");
    const row = await getStore().selectProject(p.id, A);
    await getStore().updateProjectRow(p.id, A, row.version, { ...row.doc, render: { ts: 777 } });
    let asked = 0;
    memoryStore.signedObjectUrl = async () => { asked += 1; return "https://storage.example/signed"; };
    try {
      const req = new Request("http://localhost/x", {
        headers: { ...Object.fromEntries(as(A).headers), "if-none-match": '"777"' },
      });
      const res = await getRender(req, { params: Promise.resolve({ name: `${p.id}.mp4` }) });
      expect(res.status).toBe(304);
      expect(asked, "304 인데 서명을 만들었다").toBe(0);
    } finally {
      delete memoryStore.signedObjectUrl;
    }
  });
});
