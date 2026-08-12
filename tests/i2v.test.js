import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { generateClip, fitDuration, I2V_MAX_SECONDS } from "../lib/i2v";
import { profileFor, fitDurationFor, maxSecondsFor, clipProfileForProject } from "../lib/clip-limits";
import { runWithActor } from "../lib/actor.js";
import { memoryStore } from "../lib/store/memory.js";

// 사용자 축은 이제 고정 상한이 아니라 **잔액**(크레딧)이다 — 충전이 없으면 유료 호출이
// 나가기 전에 막힌다. 이 파일이 보는 것은 요청의 모양이므로 넉넉히 충전해 열어 둔다.
beforeEach(() =>
  memoryStore.insertGrant({ user_id: "t-user", amount_credits: 1000, reason: "테스트", granted_by: "admin" })
);

const LTX = "fal-ai/ltx-2.3/image-to-video/fast";
// 열거 눈금을 뜻할 때 쓴다. fitDuration(상수)은 기본 엔드포인트(Kling)로 풀리므로
// LTX 의 올림을 확인하려면 프로필을 명시해야 한다.
const fitLtx = (s) => fitDurationFor(profileFor(LTX), s);

import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// 비용 기록이 저장소의 data/ 를 오염시키지 않게 임시 디렉터리로 돌린다 —
// 이 테스트들은 addRecord 가 실제로 도는 경로를 지난다.
process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-t-"));

afterEach(() => { delete process.env.SHOTFORM_FAKE; });

// 모델은 이제 **프로젝트**가 정한다(env 는 폐지됐다). 이 묶음은 프로젝트를 안 넘긴 호출,
// 즉 레거시(Kling v3, 3~15초 범위)를 전제로 쓰여 있다.
// 열거 눈금(LTX)의 올림은 순수 함수(fitDurationFor)로만 확인한다 — 고를 수 있는 모델이 아니다.
describe("generateClip", () => {
  it("가짜 모드에서는 이미지 URL을 그대로 클립으로 돌려준다", async () => {
    process.env.SHOTFORM_FAKE = "1";
    let called = false;
    const r = await generateClip({
      imageUrl: "data:image/svg+xml;base64,AAA", seconds: 2, aspect_ratio: "9:16",
      fetchImpl: () => { called = true; },
    });
    expect(called).toBe(false);
    // 2초는 Kling 하한(3초)보다 짧아 3초로 올라간다 — 가짜 모드도 진짜와 같은 값을 돌려줘야 한다
    expect(r).toEqual({ url: "data:image/svg+xml;base64,AAA", seconds: 3, truncated: false });
  });

  // 관통에서 낭독 실측(9초·5초)을 그대로 보냈다가 네 컷 전부 422 로 거절당했다:
  //   Input should be 6, 8, 10, 12, 14, 16, 18 or 20
  it("모델이 받는 눈금으로 올려 보낸다 — 임의의 초는 422 로 거절당한다", () => {
    expect(fitLtx(5)).toBe(6);    // 하한 — 5초짜리 컷은 만들 수 없다
    expect(fitLtx(9)).toBe(10);
    expect(fitLtx(6)).toBe(6);    // 눈금에 있으면 그대로
    expect(fitLtx(4.3)).toBe(6);
    expect(fitLtx(13)).toBe(14);
    expect(fitLtx(25)).toBe(20);  // 상한에 묶는다
  });

  it("내리지 않는다 — 내리면 소리가 그림보다 길어져 뒤가 잘린다", () => {
    // 열거 모델은 올린다(그 차이는 합성이 잘라낸다). 범위 모델은 그대로 살 수 있어
    // 올림이 0 인 것이 정상이다 — 어느 쪽이든 **내려가지 않는 것**이 지켜야 할 규칙이다.
    for (const s of [3, 5, 7, 9, 11]) {
      expect(fitLtx(s)).toBeGreaterThan(s);
      expect(fitDuration(s)).toBeGreaterThanOrEqual(s);
    }
  });

  it("상한보다 긴 컷만 잘린 것으로 표시한다", async () => {
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "https://fal.media/v.mp4" } }) };
    };
    const r = await runWithActor("t-user", () => generateClip({ imageUrl: "i", seconds: 25, aspect_ratio: "9:16", fetchImpl }));
    const klingMax = maxSecondsFor(clipProfileForProject());
    expect(sent.duration).toBe(klingMax);
    expect(r.seconds).toBe(klingMax);
    expect(r.truncated).toBe(true);
  });

  it("하한에 맞춰 올린 것은 잘린 것이 아니다", async () => {
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "v" } }) };
    };
    const r = await runWithActor("t-user", () => generateClip({ imageUrl: "i", seconds: 2.3, aspect_ratio: "9:16", fetchImpl }));
    expect(sent.duration).toBe(3);
    expect(r.truncated).toBe(false);
  });

  it("이미지와 비율을 요청에 담는다", async () => {
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "v" } }) };
    };
    await runWithActor("t-user", () => generateClip({ imageUrl: "https://img/1.png", seconds: 4, aspect_ratio: "1:1", fetchImpl }));
    expect(sent.image_url).toBe("https://img/1.png");
    expect(sent.aspect_ratio).toBe("1:1");
  });

  it("움직임 지시를 요청에 담는다 — 없으면 모델 재량이 된다", async () => {
    // 이 자리가 오래 비어 있었다. 이미지와 길이만 보내면 컷이 어떻게 움직일지를
    // 아무도 정하지 않는다 — 숏폼에서 움직임은 컷 정보량의 절반이다.
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "v" } }) };
    };
    await runWithActor("t-user", () => generateClip({
      imageUrl: "https://img/1.png", seconds: 4, aspect_ratio: "9:16",
      prompt: "카메라가 천천히 뒤로 물러난다", fetchImpl,
    }));
    expect(sent.prompt).toContain("카메라가 천천히 뒤로 물러난다");
  });

  it("초가 없거나 0이어도 만들 수 있는 가장 짧은 길이로 간다", async () => {
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "v" } }) };
    };
    await runWithActor("t-user", () => generateClip({ imageUrl: "i", seconds: 0, aspect_ratio: "9:16", fetchImpl }));
    expect(sent.duration).toBe(3);
  });

  it("결과가 비면 던진다", async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({}) });
    await expect(
      runWithActor("t-user", () =>
        generateClip({ imageUrl: "i", seconds: 4, aspect_ratio: "9:16", fetchImpl })
      )
    ).rejects.toThrow(/비어/);
  });

  it("실패하면 상태 코드를 담아 던진다", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, text: async () => "boom" });
    await expect(
      runWithActor("t-user", () =>
        generateClip({ imageUrl: "i", seconds: 4, aspect_ratio: "9:16", fetchImpl })
      )
    ).rejects.toThrow(/500/);
  });
});

// 모델을 바꾸면 눈금과 body 가 함께 따라와야 한다 — 눈금만 따라오면 오디오가 켜진 채로
// 청구되고(단가 $0.084 → $0.126) 클립에 소리가 실려 낭독과 두 겹이 된다.
describe("generateClip — 프로젝트의 프로필이 요청을 정한다", () => {
  const KLING = "fal-ai/kling-video/v3/standard/image-to-video";
  const klingProject = { settings: { i2v_model: "kling-v3" } };
  const seedanceProject = { settings: { i2v_model: "seedance-2.0" } };
  const sender = () => {
    const box = {};
    return {
      box,
      fetchImpl: async (url, opts) => {
        box.url = url;
        box.sent = JSON.parse(opts.body);
        return { ok: true, json: async () => ({ video: { url: "https://fal.media/v.mp4" } }) };
      },
    };
  };

  // 모델 정보가 없는 호출(옛 호출부·프로젝트를 못 쥔 자리)이 여기로 온다. 부르는 모델과
  // 프로필이 갈려 있으면 Kling 을 부르면서 다른 프로필을 써서 `generate_audio` 가 빠지고,
  // 오디오가 켜진 채 청구되며($0.084→$0.126) 클립 소리가 낭독과 두 겹이 된다.
  it("project 가 없어도 부르는 모델과 프로필이 같다", async () => {
    const { box, fetchImpl } = sender();
    await runWithActor("t-user", () => generateClip({ imageUrl: "i", seconds: 7, aspect_ratio: "9:16", fetchImpl }));
    expect(box.url).toContain(KLING);
    expect(box.sent.generate_audio).toBe(false);
    expect(box.sent.duration).toBe(7);
  });

  it("Kling 에서는 낭독 초를 그대로 산다 — 올림 손실이 사라진다", async () => {
    const { box, fetchImpl } = sender();
    const r = await runWithActor("t-user", () =>
      generateClip({ imageUrl: "i", seconds: 7, aspect_ratio: "9:16", project: klingProject, fetchImpl })
    );
    expect(box.sent.duration).toBe(7);
    expect(r.seconds).toBe(7);
    expect(box.url).toContain(KLING);
  });

  it("Kling 에서는 오디오를 끈다", async () => {
    const { box, fetchImpl } = sender();
    await runWithActor("t-user", () =>
      generateClip({ imageUrl: "i", seconds: 5, aspect_ratio: "9:16", project: klingProject, fetchImpl })
    );
    expect(box.sent.generate_audio).toBe(false);
  });

  // 모델마다 body 가 다르다 — Seedance 는 해상도를 받고 Kling 은 모른다.
  // 모르는 필드를 보내면 거절될 수 있어 프로필이 그 차이를 쥔다.
  it("모델별 필드는 그 모델에만 실린다", async () => {
    const seed = sender();
    await runWithActor("t-user", () =>
      generateClip({ imageUrl: "i", seconds: 5, aspect_ratio: "9:16", project: seedanceProject, fetchImpl: seed.fetchImpl })
    );
    expect(seed.box.sent.resolution).toBe("720p");

    const kl = sender();
    await runWithActor("t-user", () =>
      generateClip({ imageUrl: "i", seconds: 5, aspect_ratio: "9:16", project: klingProject, fetchImpl: kl.fetchImpl })
    );
    expect("resolution" in kl.box.sent).toBe(false);
  });

  it("잘림 판정도 그 프로젝트 프로필의 상한으로 한다", async () => {
    const { box, fetchImpl } = sender();
    const r = await runWithActor("t-user", () =>
      generateClip({ imageUrl: "i", seconds: 16, aspect_ratio: "9:16", project: klingProject, fetchImpl })
    );
    expect(box.sent.duration).toBe(15);
    expect(r.truncated).toBe(true);
    // LTX 상한(20)으로 재면 16초가 잘리지 않은 것으로 나온다 — 그 실수를 여기서 막는다
    expect(maxSecondsFor(profileFor(LTX))).toBe(20);
    // 화면이 쓰는 상수도 이제 같은 15 다(예전에는 20 이라 화면만 다른 말을 했다)
    expect(I2V_MAX_SECONDS).toBe(15);
  });

  it("가짜 모드도 그 프로젝트 프로필의 초를 돌려준다", async () => {
    process.env.SHOTFORM_FAKE = "1";
    // Seedance 하한은 4초라 2초 요청이 4초로 올라간다 — 가짜 모드도 같은 값을 돌려줘야
    // 화면·합성이 진짜와 다른 길이를 보지 않는다
    const r = await generateClip({ imageUrl: "img", seconds: 2, aspect_ratio: "9:16", project: seedanceProject });
    expect(r.seconds).toBe(4);
    const legacy = await generateClip({ imageUrl: "img", seconds: 2, aspect_ratio: "9:16" });
    expect(legacy.seconds).toBe(3);
  });
});

// 모델은 이제 env 가 아니라 **프로젝트**가 정한다. 여기서 재는 것은 목 호출 횟수가 아니라
// 실제로 나가는 URL 과 body 다 — 배선의 오타는 그 둘에서만 드러난다.
describe("클립이 프로젝트의 모델로 나간다", () => {
  const SEEDANCE = "https://fal.run/bytedance/seedance-2.0/image-to-video";
  const KLING_URL = "https://fal.run/fal-ai/kling-video/v3/standard/image-to-video";

  // 가짜 모드가 켜져 있으면 generateClip 이 조기 반환해 요청이 안 나간다 — 여기서는 꺼 둔다.
  beforeEach(() => { process.env.SHOTFORM_FAKE = "off"; });

  const captor = () => {
    const calls = [];
    return {
      calls,
      fetchImpl: async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return { ok: true, json: async () => ({ video: { url: "https://x/v.mp4" } }) };
      },
    };
  };

  const base = { imageUrl: "https://x/i.png", seconds: 5, aspect_ratio: "9:16", prompt: "움직인다", projectId: "p1" };

  it("Seedance 프로젝트는 Seedance 로 나가고 오디오가 꺼져 있다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("t-user", () =>
      generateClip({ ...base, project: { settings: { i2v_model: "seedance-2.0" } }, fetchImpl })
    );
    expect(calls[0].url).toBe(SEEDANCE);
    expect(calls[0].body.generate_audio).toBe(false);
    expect(calls[0].body.duration).toBe(5);
  });

  // ★★ 옛 프로젝트가 조용히 모델을 갈아타면 안 된다
  it("i2v_model 이 없는 프로젝트는 Kling 으로 나간다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("t-user", () => generateClip({ ...base, project: { settings: {} }, fetchImpl }));
    expect(calls[0].url).toBe(KLING_URL);
  });

  it("모르는 모델 이름도 Kling 으로 떨어진다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("t-user", () =>
      generateClip({ ...base, project: { settings: { i2v_model: "veo-9" } }, fetchImpl })
    );
    expect(calls[0].url).toBe(KLING_URL);
  });

  it("project 를 안 넘겨도 Kling 으로 나간다 — 옛 호출부가 조용히 비싸지면 안 된다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("t-user", () => generateClip({ ...base, fetchImpl }));
    expect(calls[0].url).toBe(KLING_URL);
  });

  it("모델의 길이 눈금이 실제 요청에 실린다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("t-user", () =>
      generateClip({ ...base, seconds: 2, project: { settings: { i2v_model: "seedance-2.0" } }, fetchImpl })
    );
    // Seedance 바닥은 4 초다(Kling 은 3 초)
    expect(calls[0].body.duration).toBe(4);
  });

  it("원장에 남는 endpoint 도 그 프로젝트의 모델이다 — 무엇으로 만들었는지가 기록으로 남는다", async () => {
    const { fetchImpl } = captor();
    await runWithActor("t-user", () =>
      generateClip({ ...base, projectId: "p-seed", project: { settings: { i2v_model: "seedance-2.0" } }, fetchImpl })
    );
    const rows = await memoryStore.allCosts();
    const mine = rows.filter((r) => r.project_id === "p-seed");
    expect(mine).toHaveLength(1);
    expect(mine[0].endpoint).toBe("bytedance/seedance-2.0/image-to-video");
  });
});
