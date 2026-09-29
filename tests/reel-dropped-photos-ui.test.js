// **참조에서 빠진 사진을 화면이 말한다** (2026-09-29).
//
// ★★★ 왜 생겼나. 통짜 굽기는 얼굴이 든 사진을 **판과 함께 안 보낸다**(초상 정책 방어,
//   2026-09-04). 그 자체는 맞는 규칙인데 **조용했다** — 프로덕션 편 `1c979787` 은 올린
//   사진 네 장이 전부 빠졌는데 화면이 아무 말도 안 했고, 그래서 "영상 속 강아지가 판과
//   다르다"가 왜 나는지 아무도 몰랐다(영상 모델이 실물을 한 번도 못 봤다).
//
// ★ 같은 저장소가 **비율 초과** 사진에 대해서는 이미 같은 교훈을 적어 두고 고쳤다 —
//   *"버리면 사장님이 올린 로고가 조용히 안 실리고, 그러면 이 작업이 없애려던 증상이
//   그대로 남는다"*(lib/reel/pipeline.js). 그쪽은 여백을 넣어 **살렸고**, 얼굴 판정만
//   여전히 버리고 있었다. 여기서는 살릴 수 없다(보내면 굽기가 거절된다) — 그러니
//   **말해 주는 것**이 할 수 있는 전부다.
//
// ★ 화면 계약은 이 저장소 관례대로 **소스 문자열**로 잰다(렌더 인프라가 없다).
//   ⚠️ 주석은 걷어내고 잰다 — 안 그러면 이 파일 머리말의 낱말에 맞아, 문구를 통째로
//     지워도 그린이 된다(tests/reel-ui.test.js 가 2026-08-21 에 실제로 겪었다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { oneShotDroppedPhotos } from "../lib/reel/oneshot.js";

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const video = stripComments(readFileSync("app/reel/[id]/video/page.js", "utf8"));

describe("⑤영상 화면이 빠진 사진을 알린다", () => {
  it("★★★ 판정을 화면이 직접 부른다 — 손으로 다시 적으면 서버와 갈린다", () => {
    expect(video, "oneShotDroppedPhotos 를 안 읽는다").toMatch(/oneShotDroppedPhotos/);
  });

  it("★★ 빠진 장수를 문구에 싣는다 — '사진이 빠졌어요'만으로는 몇 장인지 모른다", () => {
    // 장수를 실제로 세어 문구에 끼워 넣는 자리가 있어야 한다.
    expect(video).toMatch(/dropped[\s\S]{0,400}\.length/);
  });

  it("★ 무엇이 왜 빠졌는지 사람 말로 말한다", () => {
    expect(video, "사진이 빠졌다는 말이 없다").toMatch(/사진/);
    expect(video, "얼굴 때문이라는 이유가 없다").toMatch(/얼굴/);
  });

  it("빠진 것이 없으면 문구를 안 그린다 — 없는 경고는 잡음이다", () => {
    expect(video).toMatch(/dropped\.length\s*>\s*0|dropped\.length\s*\?/);
  });
});

describe("판정은 서버와 같은 한 벌이다", () => {
  const p = (id, extra) => ({ id, url: `/api/uploads/${id}.jpg`, ...extra });

  it("얼굴이 있다고 판정된 사진만 빠진 것으로 센다", () => {
    const project = {
      material: {
        photos: [
          p("dog", { role: "person", vision: { person: false, any_face: false } }),
          p("crowd", { role: "product", vision: { person: false, any_face: true } }),
        ],
      },
    };
    expect(oneShotDroppedPhotos(project).map((x) => x.id)).toEqual(["crowd"]);
  });
});
