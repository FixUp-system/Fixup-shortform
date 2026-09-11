// fal 머리말이 **한 자리**에 산다 (2026-09-11).
//
// ★★★ 이 판이 막는 사고: **이용자 사진이 fal 의 보관소에 30일 쌓이는 것.**
//   fal 은 기본으로 요청·응답 JSON 을 30일 보관하는데, 우리 요청 몸통에는 사장님이 올린
//   사진이 **data URI 로 통째로** 들어간다(업로드 버킷이 비공개라 URL 대신 바이트를 넘긴다).
//   `X-Fal-Store-IO: "0"` 이 그 보관을 끈다.
//
// ★★ 그전에는 인증 머리말이 **열두 곳**에 손으로 적혀 있었다. 그 상태에서는 머리말을
//   하나 더할 때 한 곳만 빠져도 아무도 모른다 — 그리고 그 빠진 한 곳이 사진을 보내는
//   자리일 수 있다. 그래서 "손으로 적은 자리가 없다"를 판이 지킨다.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { falHeaders } from "../lib/fal-auth.js";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("fal 머리말 — 한 자리", () => {
  it("★★★ 인증 머리말을 손으로 적은 자리가 없다", () => {
    const offenders = [];
    for (const p of [...walk("lib"), ...walk("app")]) {
      if (p.replace(/\\/g, "/").endsWith("lib/fal-auth.js")) continue;   // 여기가 그 한 자리다
      const src = readFileSync(p, "utf8");
      if (/Key \$\{process\.env\.FAL_KEY\}/.test(src)) offenders.push(p);
    }
    expect(offenders).toEqual([]);
  });

  it("★★★ 기본이 **안 남김**이다 — 스위치를 잊으면 안전한 쪽으로 떨어진다", () => {
    const before = process.env.SHOTFORM_FAL_KEEP_IO;
    delete process.env.SHOTFORM_FAL_KEEP_IO;
    expect(falHeaders()["X-Fal-Store-IO"], "보관 차단 머리말이 없다").toBe("0");
    // 오타는 안전한 쪽으로 — "1" 일 때만 보관을 켠다.
    process.env.SHOTFORM_FAL_KEEP_IO = "true";
    expect(falHeaders()["X-Fal-Store-IO"], "오타가 보관을 켰다").toBe("0");
    process.env.SHOTFORM_FAL_KEEP_IO = "1";
    expect(falHeaders()["X-Fal-Store-IO"], "디버깅용 스위치가 안 먹는다").toBeUndefined();
    if (before === undefined) delete process.env.SHOTFORM_FAL_KEEP_IO;
    else process.env.SHOTFORM_FAL_KEEP_IO = before;
  });

  it("★★ 인증 머리말은 그대로 실린다", () => {
    const before = process.env.FAL_KEY;
    process.env.FAL_KEY = "test-key";
    expect(falHeaders().Authorization).toBe("Key test-key");
    if (before === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = before;
  });

  it("★★ 부르는 쪽이 준 머리말을 덮지 않는다", () => {
    const h = falHeaders({ "Content-Type": "application/json" });
    expect(h["Content-Type"]).toBe("application/json");
    expect(h.Authorization).toMatch(/^Key /);
  });

  it("★★★ fal 을 부르는 파일들이 전부 이 한 자리를 가져다 쓴다", () => {
    // 손글씨가 없는 것만으로는 부족하다 — 새 파일이 머리말 없이 fal 을 부를 수도 있다.
    // ★ **공개 문서를 받는 자리는 뺀다.** lib/fal-webhook.js 는 fal 의 JWKS
    //   (`rest.fal.ai/.well-known/jwks.json`)만 받는다 — 우리 키도, 이용자 데이터도 안 보낸다.
    //   그 자리에 인증 머리말을 요구하면 판이 **틀린 것을 강요**하게 된다.
    const callers = [];
    for (const p of walk("lib")) {
      const src = readFileSync(p, "utf8")
        .split("\n")
        .filter((l) => !l.includes(".well-known"))
        .join("\n");
      if (/queue\.fal\.run|rest\.fal\.ai|fal\.run\//.test(src)) callers.push(p);
    }
    expect(callers.length, "fal 을 부르는 파일을 하나도 못 찾았다").toBeGreaterThan(3);
    for (const p of callers) {
      expect(readFileSync(p, "utf8"), `${p} 가 머리말을 안 가져온다`).toMatch(/falHeaders/);
    }
  });
});
