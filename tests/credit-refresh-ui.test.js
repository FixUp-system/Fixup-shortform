// 잔액이 바뀌었는데 상단바가 옛 숫자를 들고 있으면, 사장님은 크레딧이 안 나갔거나
// 안 들어온 줄 안다. 돈에 관한 화면에서 그 오해가 가장 나쁘다(2026-08-13 사용자 지적).
//
// 상단바는 공유본(components/MeContext.jsx)을 본다 — **바뀐 뒤 다시 읽어야** 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const admin = readFileSync("app/admin/page.js", "utf8");
const me = readFileSync("app/api/me/route.js", "utf8");
const voice = readFileSync("app/create/[id]/voice/page.js", "utf8");
const images = readFileSync("app/create/[id]/images/page.js", "utf8");
const video = readFileSync("app/create/[id]/video/page.js", "utf8");

describe("잔액이 바뀌면 상단바도 바뀐다", () => {
  // 넣는 쪽 — 운영자가 자기 계정에 넣으면 상단바가 그 자리에서 바뀌어야 한다.
  it("크레딧을 넣으면 공유본을 다시 읽는다", () => {
    expect(admin).toMatch(/useMe/);
    expect(admin).toMatch(/reloadMe|loadMe/);
  });

  // ★ 남에게 넣었을 때까지 상단바를 흔들 이유는 없다 — 내 것일 때만 다시 읽는다.
  //   그 판정을 하려면 /api/me 가 내 id 를 줘야 한다.
  it("내 id 를 알려 준다 — 누구에게 넣었는지 가릴 수 있게", () => {
    expect(me).toMatch(/id:\s*user\.id/);
  });

  // 깎이는 쪽 — 정가는 ③목소리·④이미지에서 걷히고, 재생성은 컷마다 걷힌다.
  it("만들기 시작하면 공유본을 다시 읽는다", () => {
    for (const [name, src] of [["voice", voice], ["images", images], ["video", video]]) {
      expect(src, `${name} 이 공유본을 안 쓴다`).toMatch(/useMe/);
      expect(src, `${name} 이 잔액을 다시 안 읽는다`).toMatch(/reloadMe|loadMe/);
    }
  });
});
