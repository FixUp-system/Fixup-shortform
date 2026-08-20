import { describe, it, expect } from "vitest";
import {
  FILM_STEPS, filmStepHref, filmStepFromPathname, currentFilmStepKey, isFilmStepReachable,
} from "../lib/film/steps.js";

const ID = "11111111-1111-4111-8111-111111111111";
const withScenario = { id: ID, scenario: { text: "Vertical 9:16 footage.", tries: 1 } };
const withImages = { ...withScenario, films: { order: { images: [{ key: "shot-1", url: "u" }] } } };
const withVideo = { ...withScenario, films: { order: { images: [{ key: "shot-1", url: "u" }], video: { url: "/api/renders/x-order.mp4" } } } };

describe("단계 표", () => {
  it("★ 다섯 단계이고 순서가 정해져 있다", () => {
    expect(FILM_STEPS.map((s) => s.key)).toEqual(["material", "scenario", "images", "video", "done"]);
  });

  it("★ 표는 못 바꾼다 — 호출부가 늘리면 스테퍼와 가드가 런타임에 갈린다", () => {
    expect(Object.isFrozen(FILM_STEPS)).toBe(true);
    expect(() => FILM_STEPS.push({ key: "hack" })).toThrow();
  });

  it("★ 방식과 무관한 단계는 입력·시나리오 둘뿐이다 — 그림부터 갈린다", () => {
    expect(FILM_STEPS.filter((s) => !s.perMode).map((s) => s.key)).toEqual(["material", "scenario"]);
  });
});

describe("주소", () => {
  it("★ 공유 단계의 주소에는 방식이 안 들어간다", () => {
    const step = FILM_STEPS.find((s) => s.key === "scenario");
    expect(filmStepHref(step, ID, "order")).toBe(`/film/${ID}/scenario`);
  });

  it("★ 방식별 단계의 주소에는 방식이 들어간다", () => {
    const step = FILM_STEPS.find((s) => s.key === "images");
    expect(filmStepHref(step, ID, "refs")).toBe(`/film/${ID}/refs/images`);
  });

  it("★ 모르는 방식으로는 주소를 못 만든다 — 조용히 한쪽으로 떨어지면 값이 헛나간다", () => {
    const step = FILM_STEPS.find((s) => s.key === "images");
    expect(() => filmStepHref(step, ID, "nope")).toThrow();
  });

  it("★ 경로에서 단계를 되찾는다 — 공유·방식별 둘 다", () => {
    expect(filmStepFromPathname(`/film/${ID}/scenario`).key).toBe("scenario");
    expect(filmStepFromPathname(`/film/${ID}/order/images`).key).toBe("images");
  });

  it("옛 한 화면(/film/one/...)은 이 표의 단계가 아니다 — 가드가 그 화면을 건드리면 안 된다", () => {
    expect(filmStepFromPathname("/film/one/order")).toBe(undefined);
  });
});

describe("지금 있어야 할 단계", () => {
  it("시나리오가 없으면 시나리오다", () => {
    expect(currentFilmStepKey({ id: ID }, "order")).toBe("scenario");
  });

  it("시나리오가 있고 그림이 없으면 그림이다", () => {
    expect(currentFilmStepKey(withScenario, "order")).toBe("images");
  });

  it("그림이 있으면 영상이다", () => {
    expect(currentFilmStepKey(withImages, "order")).toBe("video");
  });

  it("★ 방식마다 따로 센다 — order 로 구웠다고 refs 가 앞서가면 안 된다", () => {
    expect(currentFilmStepKey(withImages, "refs")).toBe("images");
  });
});

describe("열림 판정", () => {
  it("입력·시나리오는 언제나 열린다", () => {
    expect(isFilmStepReachable("material", { id: ID }, "order")).toBe(true);
    expect(isFilmStepReachable("scenario", { id: ID }, "order")).toBe(true);
  });

  it("시나리오가 없으면 그림은 안 열린다 — 값이 나가는 자리다", () => {
    expect(isFilmStepReachable("images", { id: ID }, "order")).toBe(false);
  });

  it("그림이 없으면 영상은 안 열린다", () => {
    expect(isFilmStepReachable("video", withScenario, "order")).toBe(false);
  });

  // ★★ 2026-07-29 에 단계별에서 겪은 잠금 고리의 회귀 시험이다.
  //   완성이 "지금 단계"로 판정되기를 기다리면 아무도 완성에 못 들어간다 —
  //   굽기가 끝나면 지금 단계는 여전히 영상인데 완성은 **열려 있어야** 한다.
  it("★ 구운 뒤 완성이 열린다 — '열려 있다'와 '지금 있어야 한다'는 다르다", () => {
    expect(isFilmStepReachable("done", withVideo, "order")).toBe(true);
    expect(currentFilmStepKey(withVideo, "order")).not.toBe("done");
  });

  it("영상이 없으면 완성은 안 열린다", () => {
    expect(isFilmStepReachable("done", withImages, "order")).toBe(false);
  });
});
