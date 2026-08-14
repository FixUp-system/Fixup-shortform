// 새 값은 다섯 라우트에 **전부** 실린다. 다섯이 서로 다른 것을 싣는 것이
// images_error 버그(2026-08-14)의 뿌리였다.
//
// ★ 그래서 이 그물은 "새 값이 실렸나"만 보지 않는다. **원래 싣던 값이 여전히 실리나**도
//   같이 본다. 이 판이 존재하는 이유가 정확히 그것이다 — selectProjectCuts 가 조용히
//   images_error 를 안 주기 시작했고 몇 달 동안 아무도 몰랐다. 같은 파일에서 같은 일이
//   voice_error·video_error 까지 세 번 났다. 필드가 사라지는 것을 안 잡는 회귀 그물은
//   제 일의 절반만 하는 것이다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject, updateProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const OWNER = "77777777-7777-7777-7777-777777777777";
const AUTH = { [USER_HEADER]: OWNER, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };
const req = () => new Request("http://x/api", { headers: AUTH });

// 라우트마다 [핸들러, 이 라우트가 **원래부터** 싣던 필드들].
// keep 목록은 심장박동을 넣기 **전**의 응답 모양이다 — 여기서 하나라도 빠지면
// 그 화면은 다시 눈이 먼다.
const routes = {
  status: {
    GET: (await import("../app/api/projects/[id]/status/route.js")).GET,
    keep: ["status", "kind", "cuts_error", "voice_error", "images_error", "video_error", "render_error", "cut_count"],
  },
  cuts: {
    GET: (await import("../app/api/projects/[id]/cuts/status/route.js")).GET,
    keep: ["status", "cuts", "cuts_error"],
  },
  voice: {
    GET: (await import("../app/api/projects/[id]/voice/status/route.js")).GET,
    keep: ["status", "cuts", "voice_error"],
  },
  clips: {
    GET: (await import("../app/api/projects/[id]/clips/status/route.js")).GET,
    keep: ["status", "cuts", "video_error"],
  },
  render: {
    GET: (await import("../app/api/projects/[id]/render/status/route.js")).GET,
    keep: ["status", "kind", "render", "render_error"],
  },
};

describe("상태 라우트가 심장박동을 실어 보낸다", () => {
  let id;
  beforeEach(async () => {
    resetMemoryStore();
    const p = await createProject({ ownerId: OWNER, settings: {} });
    id = p.id;
    await updateProject(id, OWNER, (proj) => ({
      ...proj,
      cuts: [{ idx: 0 }, { idx: 1 }],
      progress: { at: Date.now() - 5000, phase: "images", done: 1, total: 2 },
    }));
  });

  for (const [name, { GET, keep }] of Object.entries(routes)) {
    it(`${name} 응답에 stalled_for_ms 와 progress 가 있다`, async () => {
      const res = await GET(req(), { params: Promise.resolve({ id }) });
      const body = await res.json();
      expect(body.stalled_for_ms, `${name} 이 stalled_for_ms 를 안 실었다`).toBeGreaterThanOrEqual(5000);
      // ★ 위아래로 조인다. 아래만 있으면 상수 하나를 박아 넣어도 통과한다 —
      //   실제로 뺄셈을 했다는 것을 못 보증한다.
      expect(body.stalled_for_ms, `${name} 의 stalled_for_ms 가 뺄셈 결과가 아니다`).toBeLessThan(60_000);
      expect(body.progress.phase).toBe("images");
      expect(body.progress.done).toBe(1);
      expect(body.progress.total).toBe(2);
    });

    it(`${name} 이 원래 싣던 필드를 그대로 싣는다`, async () => {
      const res = await GET(req(), { params: Promise.resolve({ id }) });
      const body = await res.json();
      for (const key of keep) {
        expect(body, `${name} 이 ${key} 를 떨어뜨렸다`).toHaveProperty(key);
      }
    });

    it(`progress 가 없는 옛 프로젝트는 ${name} 도 stalled_for_ms 가 null 이다`, async () => {
      // null 과 0 은 다르다. null 은 "판정 불가"이고 0 은 "방금 뛰었다"다 —
      // 섞으면 판정할 수 없는 옛 프로젝트가 영원히 건강해 보인다.
      const p = await createProject({ ownerId: OWNER, settings: {} });
      const body = await (await GET(req(), { params: Promise.resolve({ id: p.id }) })).json();
      expect(body.stalled_for_ms, `${name} 이 null 대신 다른 것을 실었다`).toBeNull();
      expect(body.progress).toBeNull();
    });
  }

  it("★ 컷 상태가 images_error 를 실어 보낸다 — 이 자리가 비어 있었다", async () => {
    await updateProject(id, OWNER, (proj) => ({ ...proj, images_error: "이미지 생성 실패 (429) x" }));
    const body = await (await routes.cuts.GET(req(), { params: Promise.resolve({ id }) })).json();
    expect(body.images_error).toBe("이미지 생성 실패 (429) x");
  });
});
