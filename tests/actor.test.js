import { describe, it, expect } from "vitest";
import { runWithActor, currentActor } from "../lib/actor.js";
import { costActor } from "../lib/costs.js";

describe("actor 컨텍스트", () => {
  it("감싼 안에서는 actor 를 돌려준다", () => {
    const got = runWithActor("u-1", () => currentActor());
    expect(got).toBe("u-1");
  });

  it("비동기 안쪽까지 따라간다", async () => {
    const got = await runWithActor("u-2", async () => {
      await new Promise((r) => setTimeout(r, 10));
      return currentActor();
    });
    expect(got).toBe("u-2");
  });

  it("컨텍스트가 없으면 던진다 — local 로 떨어지지 않는다", () => {
    expect(() => currentActor()).toThrow(/actor 컨텍스트/);
  });

  it("actor 가 비면 감싸는 것 자체를 거부한다", () => {
    expect(() => runWithActor("", () => 1)).toThrow(/actor/);
    expect(() => runWithActor(null, () => 1)).toThrow(/actor/);
  });

  it("costActor() 가 컨텍스트를 읽는다 — 더 이상 local 이 아니다", () => {
    expect(runWithActor("u-3", () => costActor())).toBe("u-3");
  });

  it("costActor() 도 컨텍스트가 없으면 던진다", () => {
    expect(() => costActor()).toThrow(/actor 컨텍스트/);
  });
});
