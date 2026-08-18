// [다시 만들기]를 누르면 **눌렸다는 것과 도는 중이라는 것**이 보여야 한다.
//
// 사장님 지적(2026-08-18): "영상이나 이미지를 다시 만들기를 진행했을 때 사용자 입장에서
// 다시 만들어지는지 버튼이 눌린 건지 확인이 안 돼."
//
// 두 자리가 겹쳐 있었다:
//
// ★ **라우트가 동기다.** 생성 라우트 여섯과 달리 재생성 셋은 `await regen…` 으로 **기다렸다가
//   답한다**(화면이 그 응답을 받고 곧바로 다시 읽는 구조다). 그런데 `maxDuration` 이 없어
//   배포 기본값에 잘리고, 잘리면 사장님에게는 그냥 실패다 — 클립 재생성은 실측 컷당
//   100~800초라 그 경계에 정면으로 걸린다. (자막 라우트가 같은 이유로 이미 300 을 명시하고
//   있고, 그 주석이 "기다렸다가 답하는 유일한 라우트"라 적었는데 사실은 이 셋도 그렇다.)
//
// ★ **④이미지에는 진행 표시가 없었다.** ⑤영상은 `regening`(다시 만드는 중인 컷)을 들고
//   카드·버튼·미리보기 세 곳에서 그것을 보는데, ④이미지는 컷의 `state` 를 낙관적으로
//   generating 으로 바꿀 뿐이라 곧바로 이어지는 `load(id)` 가 서버 값으로 덮으면 표시가
//   사라진다 — 누른 흔적이 화면에서 없어진다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const images = read("app/create/[id]/images/page.js");
const video = read("app/create/[id]/video/page.js");

const REGEN_ROUTES = [
  ["그림", "app/api/projects/[id]/cuts/[idx]/regen/route.js"],
  ["클립", "app/api/projects/[id]/clips/[idx]/regen/route.js"],
  ["목소리", "app/api/projects/[id]/voice/[idx]/regen/route.js"],
];

describe("다시 만들기 — 기다렸다가 답하는 라우트는 상한을 명시한다", () => {
  for (const [what, path] of REGEN_ROUTES) {
    it(`★ ${what} 재생성 — maxDuration 을 적는다`, () => {
      const src = read(path);
      // 정말로 기다리는지부터 확인한다 — 안 기다리면 이 단정의 전제가 사라진다
      expect(src, "이 라우트는 기다리지 않는다 — 전제가 바뀌었다").toMatch(/await regen/);
      expect(src, "상한이 없다 — 배포 기본값에 잘리면 사장님에게는 그냥 실패다")
        .toMatch(/export const maxDuration = \d+/);
      expect(src, "상한이 너무 짧다 — 클립 재생성은 실측 컷당 100~800초다")
        .not.toMatch(/maxDuration = ([1-9]|[1-9]\d|1\d\d|2[0-9]\d)\b/);
    });
  }
});

describe("다시 만들기 — 누른 것이 화면에 보인다", () => {
  // ⑤영상이 이미 하는 방식이 기준이다: **로컬 상태**로 들고 있어야 서버를 다시 읽어도
  // 표시가 안 사라진다(컷의 state 는 다시 읽는 순간 서버 값으로 덮인다).
  for (const [step, src] of [["④이미지", images], ["⑤영상", video]]) {
    it(`★ ${step} — 다시 만드는 중인 컷을 화면이 들고 있다`, () => {
      expect(src, "다시 만드는 중인 컷을 기억하지 않는다 — 다시 읽으면 표시가 사라진다")
        .toMatch(/regening/);
      // 누른 순간 세우고, 끝나면 반드시 내린다(안 내리면 버튼이 영영 잠긴다)
      expect(src, "누를 때 안 세운다").toMatch(/setRegening\((idx|c\.idx|cut\.idx)\)/);
      expect(src, "끝나고 안 내린다 — 버튼이 영영 잠긴다").toMatch(/setRegening\(null\)/);
    });

    // ★ 잠금이 **어떤 이름을 거치든** 상관없다 — ⑤영상은 버튼에서 바로 보고, ④이미지는
    //   busyCut 하나로 모아 본다(판정을 한 자리에 두는 이 저장소의 결에 맞다).
    //   재는 것은 이름이 아니라 **이어져 있는가**다: 버튼의 잠금식이 regening 에 닿아야 한다.
    it(`★ ${step} — 도는 동안 그 버튼이 잠기고 도는 중이라고 말한다`, () => {
      const direct = /disabled=\{[^}]*regening/.test(src);
      const viaBusy =
        /const busyCut =[^;]*regening/.test(src) && /disabled=\{[^}]*busyCut/.test(src);
      expect(direct || viaBusy, "도는 동안에도 버튼이 눌린다 — 두 번 누르면 값이 두 번 나간다")
        .toBe(true);
      // 문구 자체는 busyLabel 이 쥔다(lib/progress.js). 재는 것은 **regening 이 그 말에
      // 닿는가**다 — 닿아 있으면 누른 흔적이 화면에 남는다.
      // ★ 거리로 재지 않는다(2026-08-18). 사이에 주석·판정 헬퍼가 끼면 멀쩡한 배선이
      //   깨진 것처럼 보인다. 재는 것은 **regening 이 그 말의 근거인가** 하나다 —
      //   덮개 문구는 `busyLabel(regening === …)` 로 정해지고, 그 밖의 표시(카드 글줄 등)는
      //   regening 을 곁에 두고 말한다.
      expect(src, "도는 중이라는 말이 없다")
        .toMatch(/busyLabel\(\s*regening|regening[\s\S]{0,400}(다시 만드는 중|만드는 중)/);
    });
  }

  // ★ 끝나고 내리는 자리가 **finally** 여야 한다. 실패했을 때 안 내리면 그 컷은 영영 잠겨,
  //   사장님이 다시 시도할 길이 새로고침뿐이다.
  it("★ 실패해도 잠금이 풀린다", () => {
    for (const [step, src] of [["④이미지", images], ["⑤영상", video]]) {
      const fn = src.match(/async function regen\([\s\S]*?\n  \}/)?.[0] || "";
      expect(fn, `${step} 의 regen 을 못 찾았다`).toBeTruthy();
      expect(fn, `${step}: 실패하면 잠금이 안 풀린다 — finally 로 내려야 한다`).toMatch(/finally/);
    }
  });
});
