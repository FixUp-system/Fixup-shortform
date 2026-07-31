// 스파이크 — AsyncLocalStorage 컨텍스트가 "핸들러가 리턴한 뒤에 도는 작업"까지
// 상속되는지 본다. 라우트가 fire-and-forget 으로 파이프라인을 띄우는 구조라
// 이게 안 되면 actor 전파를 ALS 로 할 수 없다.
import { describe, it, expect } from "vitest";
import { AsyncLocalStorage } from "async_hooks";

const als = new AsyncLocalStorage();

describe("ALS 가 응답 이후까지 상속된다", () => {
  it("핸들러가 리턴한 뒤 도는 promise 도 컨텍스트를 본다", async () => {
    const seen = [];
    let settle;
    const done = new Promise((r) => { settle = r; });

    // 라우트 핸들러 흉내 — 백그라운드를 띄우고 곧바로 리턴한다
    function handler() {
      Promise.resolve()
        .then(() => new Promise((r) => setTimeout(r, 30)))  // AI 호출 흉내
        .then(() => {
          seen.push(als.getStore()?.actor ?? null);
          settle();
        });
      return "응답";
    }

    const ret = als.run({ actor: "u-1" }, handler);
    expect(ret).toBe("응답");   // 핸들러는 이미 끝났다
    await done;
    expect(seen).toEqual(["u-1"]);  // 그런데도 컨텍스트가 살아 있다
  });

  it("컨텍스트 밖에서는 undefined 다", () => {
    expect(als.getStore()).toBeUndefined();
  });
});
