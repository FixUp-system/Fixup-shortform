// 제품에 적힌 글자는 **읽어서 철자로 알려 준다** — 모델이 사진에서 읽게 두지 않는다.
//
// 사장님 지적(2026-08-18): "영상에서 KONKUK UNIV. 가 KONKUK UNVV 로 나온다."
//
// 그건 자막이 아니다. 광고 흐름에는 자막을 태우는 코드가 아예 없고(lib/ad/*), 단계별
// 자막은 ffmpeg 가 원고를 글자 그대로 태워 틀릴 수가 없다. 틀린 것은 **영상 안에서 모델이
// 그린 제품 글자**다.
//
// 이미지 단계에서는 맞았다(오늘 컷1·2·3 에서 KONKUK UNIV. 가 정확히 나왔다). 영상 모델은
// 프레임마다 다시 그리므로 그 사이에 철자가 흔들린다.
//
// 지금 프롬프트는 "사진에 인쇄된 글자를 그대로 재현하라"고만 하고 **그 글자가 무엇인지는
// 안 알려 준다** — 모델이 작게 찍힌 글자를 스스로 읽어야 한다. 읽는 것보다 받아쓰는 것이
// 훨씬 쉬우므로, 우리가 한 번 읽어서 철자를 박아 준다.
//
// ★ 새 호출을 만들지 않는다. describePhoto 가 이미 사진마다 한 번 돌고 그 결과가 문서에
//   저장된다(project.material.photos[].vision) — 같은 호출에 질문을 하나 더 얹는다.
//   호출 수도 값도 안 는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildImagePrompt } from "../lib/cuts.js";

const vlm = readFileSync("lib/vlm.js", "utf8");

const PROJECT = {
  settings: { aspect_ratio: "9:16" },
  scenario: { focus: { mode: "물건", subject: "a keyring", look: "yellow charm" } },
  material: { photos: [{ id: "p1", vision: { person: false, what: "키링", lettering: "KONKUK UNIV." } }, { id: "p2" }] },
};
const CUT = { idx: 0, shows: "the keyring on a table", ref_ids: ["p1"] };
const ref = (id) => ({ kind: "thing", who: null, source: "upload", photo_id: id, key: `${id}.png` });

describe("사진 판정이 글자도 읽는다", () => {
  it("★ 같은 호출에 글자를 함께 묻는다 — 새 호출을 만들지 않는다", () => {
    const at = vlm.indexOf("export async function describePhoto");
    const fn = vlm.slice(at, vlm.indexOf("\n}", at));
    expect(fn, "글자를 안 묻는다").toMatch(/lettering/);
    expect(fn, "무엇을 읽으라는 것인지 안 말한다").toMatch(/글자|적힌|인쇄/);
    // 없는 글자를 지어내면 그 철자가 확신 있게 박힌다 — 못 읽으면 비우라고 해야 한다
    expect(fn, "못 읽었을 때 비우라는 말이 없다").toMatch(/비운다|빈 문자열/);
    expect(fn, "짐작해서 채우지 말라는 말이 없다 — 짐작한 철자가 그대로 영상에 박힌다")
      .toMatch(/짐작|확실하지 않으면/);
  });

  it("★ 읽은 글자가 판정 결과에 실린다", () => {
    const at = vlm.indexOf("export async function describePhoto");
    const fn = vlm.slice(at, vlm.indexOf("\n  } catch", at));
    expect(fn, "읽어 놓고 안 돌려준다").toMatch(/lettering:/);
  });
});

describe("프롬프트가 철자를 그대로 준다", () => {
  it("★★ 그 사진에 적힌 글자를 번호와 함께 못 박는다", () => {
    const p = buildImagePrompt(CUT, PROJECT, [ref("p1")]);
    expect(p, "읽어 둔 철자를 프롬프트에 안 싣는다").toContain("KONKUK UNIV.");
    expect(p, "어느 첨부의 글자인지 안 가리킨다").toMatch(/\[1\][^.]*KONKUK UNIV\./);
    expect(p, "그대로 쓰라고 안 말한다").toMatch(/exactly|spell/i);
  });

  it("★ 글자를 못 읽은 사진에는 아무 말도 덧붙이지 않는다", () => {
    const p = buildImagePrompt({ ...CUT, ref_ids: ["p2"] }, PROJECT, [ref("p2")]);
    expect(p, "글자가 없는 사진에 글자 문구가 붙었다").not.toMatch(/reads exactly/i);
  });

  it("★ 아바타(인물)에는 안 붙는다 — 읽을 제품 글자가 없다", () => {
    const p = buildImagePrompt(CUT, PROJECT, [{ kind: "person", who: "여자", source: "avatar", key: "w.jpg" }]);
    expect(p).not.toMatch(/reads exactly/i);
  });
});

// 광고 흐름도 같은 값을 받아야 한다.
//
// 광고는 사진을 **한 번도 읽지 않았다** — 시나리오 지문에 "첨부 사진: N장"만 적고 바이트는
// 참조(r2v)로만 넘겼다. 그래서 제품에 적힌 글자를 모델이 화면에서 스스로 읽어야 했고,
// 사장님이 본 `KONKUK UNVV` 가 그 결과다. 단계별과 **같은 판정 함수**(describePhoto)를
// 쓰되, 광고에는 그 판정 자체가 없었으므로 한 번 돌려 문서에 남긴다(사진당 한 번).
describe("광고 시나리오도 철자를 받는다", () => {
  it("★ 지문에 사진마다의 글자가 실린다", async () => {
    const { buildScenarioMessages } = await import("../lib/ad/scenario.js");
    const project = {
      settings: { seconds: 15, aspect_ratio: "9:16", narration_lang: "ko", format: "hero", mood: "premium", style: "photo" },
      material: {
        text: "키링 광고",
        photos: [
          { id: "p1", vision: { lettering: "KONKUK UNIV." } },
          { id: "p2" },
        ],
      },
    };
    const msgs = buildScenarioMessages(project);
    const all = JSON.stringify(msgs);
    expect(all, "읽어 둔 철자를 지문에 안 싣는다").toContain("KONKUK UNIV.");
    expect(all, "그대로 적으라고 안 말한다").toMatch(/그대로|철자/);
  });

  it("★ 읽은 글자가 없으면 지문이 예전과 글자 그대로다", async () => {
    const { buildScenarioMessages } = await import("../lib/ad/scenario.js");
    const project = {
      settings: { seconds: 15, aspect_ratio: "9:16", narration_lang: "ko", format: "hero", mood: "premium", style: "photo" },
      material: { text: "키링 광고", photos: [{ id: "p1" }] },
    };
    expect(JSON.stringify(buildScenarioMessages(project))).not.toMatch(/적힌 글자/);
  });
});

// ★ 값이 있으려면 **읽는 자리**가 있어야 한다. 광고에는 그 자리가 아예 없었다.
describe("광고도 사진을 한 번 읽는다", () => {
  it("★ 시나리오를 만들기 전에 아직 안 본 사진을 판정한다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/ad/pipeline.js", "utf8");
    const at = src.indexOf("export async function runScenarioStep");
    const fn = src.slice(at, src.indexOf("\n}", at));
    expect(fn, "사진을 안 읽는다 — 읽어 둔 글자가 영영 안 생긴다").toMatch(/describePhoto|readPhotoVision/);
    // ★ "이미 본 사진을 또 읽지 않는다"는 이제 readPhotoVision 안에 있고
    //   tests/ad-photo-vision.test.js 가 **값으로** 잰다(소스 훑기보다 정확하다).
    //   여기서는 그 함수를 쓰는지만 본다 — 인라인으로 되돌아가면 film 이 또 못 읽는다.
    expect(fn, "공유 함수를 안 쓴다 — 인라인으로 두면 film 이 그 경로를 안 지나 사진을 못 읽는다")
      .toMatch(/readPhotoVision/);
  });
});
