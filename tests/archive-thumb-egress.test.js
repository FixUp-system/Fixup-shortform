// 보관함 카드가 전송(egress)을 무는 자리 — 2026-09-07.
//
// ★ 왜 생겼나. Supabase 가 `exceed_egress_quota` 로 프로젝트를 통째로 막아(402) 로그인도
//   보관함도 죽었다. 되짚어 보니 새는 자리가 둘이었다:
//     ① 서명 URL 이 요청마다 달라져 캐시가 전부 빗나갔다 → lib/signed-url-cache.js 가 막는다.
//     ② **보관함을 여는 것만으로** 카드 수만큼 영상 요청이 나갔다 — 이 판이 그것을 막는다.
//
// ★ 카드는 첫 컷 그림(image)을 이미 쥐고 있다. 그림은 uploads 라우트가 immutable 로
//   내보내므로 한 번 받으면 다시 안 받는다. 영상 첫 프레임을 받으려고 8~13MB 짜리 파일을
//   건드릴 이유가 없다 — poster 에 그 그림을 걸고, 영상은 **마우스를 올렸을 때** 받는다.
//   보이는 것도 하는 일도 그대로고, 안 보던 영상의 전송만 사라진다.
//
// 이 저장소의 JSX 는 소스를 읽어 잰다(주석은 strip 으로 걷어낸다 — 주석이 판정을 통과시키면
// 안 된다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));

describe("보관함 카드 — 여는 것만으로 영상을 받지 않는다", () => {
  it("★ preload 는 고정값이 아니다 — 그림이 있으면 \"none\" 으로 내려간다", () => {
    // 고정 `preload="metadata"` 면 카드 수만큼 영상 요청이 나간다.
    expect(cards).not.toMatch(/preload="metadata"/);
    expect(cards).toMatch(/preload=\{/);
    expect(cards).toMatch(/"none"/);
  });

  // ★ 그림이 **없는** 카드까지 "none" 으로 내리면 그 카드는 빈 칸이 된다(광고처럼
  //   cuts[0].image 가 없는 종류가 있다). 그때는 지금처럼 첫 프레임을 받는 쪽이 맞다 —
  //   전송을 아끼려다 보이던 것을 없애지 않는다.
  it("★ 그림이 없는 카드는 metadata 를 남긴다 — 첫 프레임이 사라지면 안 된다", () => {
    expect(cards).toMatch(/"metadata"/);
  });

  it("★ 첫 화면은 poster(첫 컷 그림)가 그린다 — 영상 바이트를 안 건드린다", () => {
    expect(cards).toMatch(/poster=\{/);
  });

  it("마우스를 올리면 그때 재생한다 — 동작은 그대로다(회귀 방어)", () => {
    expect(cards).toMatch(/onMouseEnter=\{/);
    expect(cards).toMatch(/onMouseLeave=\{/);
  });
});
