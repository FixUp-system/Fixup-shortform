// 원클릭 원본(마스터)을 crf 20 으로 구워 둔다 — 2026-09-17 사장님 결정.
//
// 🔍 왜: 원클릭은 fal 이 준 파일을 **받은 그대로** `<id>-raw.mp4` 로 저장했다. 그 파일은
//   인코딩이 비효율적이라(실측 Constrained Baseline · 12,661 kb/s) 원클릭 원본이 완성본의
//   1.6~7.5배였다(운영 14쌍 전부). 단계별은 원본도 우리가 구워 1.0배다.
// 📏 실측(원클릭 3편 · 로컬): crf 20 마스터 = −25%(2K) · −69%(768P) · −69%(480p),
//   그 마스터로 다시 구운 완성본은 오늘 완성본 대비 SSIM −0.001~−0.002.
//
// ★ 지켜야 할 것 넷:
//   ① 마스터는 완성본(crf 26)과 **다른 값**(20)이다 — 합치면 두 번 굽는 손실이 3~5배가 된다
//   ② 굽기가 실패해도 **받은 파일을 잃지 않는다** — 이미 값을 치른 영상이다
//   ③ 구운 것이 더 크면 받은 파일을 둔다
//   ④ **첫 완성본은 받은 파일에서** 굽는다 — 마스터에서 구우면 사장님이 처음 받는 영상이 두 번 깎인다
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, updateProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { attachAdVideo } from "../lib/ad/pipeline.js";
import { MASTER_CRF, masterArgs, encodeMaster } from "../lib/compose.js";

const U = "00000000-0000-4000-8000-0000000000e1";
const SETTINGS = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0",
};
const scenario = { text: "P", shots: [{ beat: "가", line: "안녕하세요", seconds: 3 }], endpoint: "t2v" };
const FAL_URL = "https://fal.example/source.mp4";

async function madeAd() {
  const p = await runWithActor(U, () =>
    createProject({ settings: SETTINGS, material: { text: "앰플 광고", photos: [] }, ownerId: U, kind: "ad" })
  );
  await runWithActor(U, () => updateProject(p.id, U, (d) => ({ ...d, scenario, status: "scenario" })));
  return p;
}

const RECEIVED = new Uint8Array(100).fill(7); // fal 이 준 파일(100바이트라 치자)
const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => RECEIVED.buffer });
const storedRaw = async (id) => Buffer.from(await getStore().getObject("renders", `${id}-raw.mp4`));

describe("마스터 인자", () => {
  it("★★★ 마스터는 crf 20 이고 완성본(crf 26)과 **다른 값**이다", () => {
    expect(MASTER_CRF).toBe("20");
    const src = readFileSync("lib/compose.js", "utf8");
    expect(src, "완성본 기본값이 26 이 아니다 — 이 판의 전제가 바뀌었다").toMatch(/:\s*"26";/);
    expect(MASTER_CRF, "마스터와 완성본을 한 값으로 합쳤다").not.toBe("26");
  });

  it("★★ 운영 인자와 같은 결로 굽는다 — libx264 · yuv420p · faststart · 소리는 그대로", () => {
    const a = masterArgs({ src: "in.mp4", out: "out.mp4" });
    const at = (k) => a[a.indexOf(k) + 1];
    expect(at("-c:v")).toBe("libx264");
    expect(at("-pix_fmt")).toBe("yuv420p");
    expect(at("-crf")).toBe("20");
    expect(at("-movflags")).toBe("+faststart");
    expect(at("-c:a"), "소리를 다시 인코딩한다 — 굽기마다 열화된다").toBe("copy");
    expect(a.at(-1)).toBe("out.mp4");
  });

  it("★ 임시 폴더는 실패해도 지운다", async () => {
    let removed = false;
    await expect(encodeMaster(Buffer.from([1]), {
      mkdtempImpl: async () => "tmpdir",
      writeFileImpl: async () => {},
      readFileImpl: async () => Buffer.from([]),
      runFfmpeg: async () => { throw new Error("ffmpeg 실패"); },
      rmImpl: async () => { removed = true; },
    })).rejects.toThrow("ffmpeg 실패");
    expect(removed).toBe(true);
  });
});

describe("원클릭 원본 저장 — 받은 파일을 마스터로", () => {
  beforeEach(() => resetMemoryStore());
  const burn = async (args) => ({ url: `/api/renders/${args.projectId}.mp4` });

  it("★★★ 구운 마스터가 더 작으면 **마스터를** 저장한다", async () => {
    const p = await madeAd();
    const master = Buffer.from(new Uint8Array(30).fill(2));
    await runWithActor(U, () => attachAdVideo(p.id, U, { url: FAL_URL }, { fetchImpl, burn, encodeMaster: async () => master }));
    expect((await storedRaw(p.id)).equals(master)).toBe(true);
  });

  it("★★★ 굽기가 실패하면 **받은 파일을 그대로** 둔다 — 값을 치른 영상을 잃지 않는다", async () => {
    const p = await madeAd();
    await runWithActor(U, () => attachAdVideo(p.id, U, { url: FAL_URL }, {
      fetchImpl, burn, encodeMaster: async () => { throw new Error("함수 안 ffmpeg 가 죽었다"); },
    }));
    expect((await storedRaw(p.id)).equals(Buffer.from(RECEIVED))).toBe(true);
  });

  it("★★ 구운 것이 **더 크면** 받은 파일을 둔다", async () => {
    const p = await madeAd();
    await runWithActor(U, () => attachAdVideo(p.id, U, { url: FAL_URL }, {
      fetchImpl, burn, encodeMaster: async () => Buffer.from(new Uint8Array(500).fill(9)),
    }));
    expect((await storedRaw(p.id)).equals(Buffer.from(RECEIVED))).toBe(true);
  });

  it("★★★ **첫 완성본은 받은 파일에서** 굽는다 — 마스터에서 구우면 두 번 깎인다", async () => {
    const p = await madeAd();
    let seen = null;
    await runWithActor(U, () => attachAdVideo(p.id, U, { url: FAL_URL }, {
      fetchImpl,
      encodeMaster: async () => Buffer.from([1]),
      burn: async (args) => { seen = args; return { url: `/api/renders/${args.projectId}.mp4` }; },
    }));
    expect(seen, "자막을 안 구웠다").toBeTruthy();
    expect(typeof seen.downloadImpl, "재료를 저장된 마스터에서 읽는다 — 첫 완성본이 두 번 깎인다").toBe("function");
  });

  it("★★ 수거·마무리 경로도 전부 받은 주소를 넘긴다 — 한 곳만 빠지면 그 길의 완성본만 두 번 깎인다", () => {
    const src = readFileSync("lib/ad/pipeline.js", "utf8");
    const calls = [...src.matchAll(/await finishWithVideo\(([^;]*)\);/g)].map((m) => m[1]);
    expect(calls.length, "마무리 호출 자리 수가 바뀌었다 — 이 판을 다시 봐라").toBe(4);
    for (const c of calls) {
      expect(c, `받은 주소를 안 넘긴다: ${c}`).toMatch(/deps,\s*(job\.url|videoUrl|ready\.url|out\.url)$/);
    }
    const stores = [...src.matchAll(/await store\(([^)]*)\)/g)].map((m) => m[1]);
    for (const s of stores) {
      expect(s, `마스터 굽기 주입을 안 넘긴다: ${s}`).toContain("deps.encodeMaster");
    }
  });
});
