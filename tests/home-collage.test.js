// 첫 화면 콜라주 — **영상 금지의 유일한 예외**를 지키는 판 (2026-09-28).
//
// 🔴 2026-09-07 에 목록이 영상 태그를 물어서 화면을 여는 것만으로 전송량 할당량이 탔고
//   로그인까지 함께 죽었다. 그 뒤로 랜딩은 `<video>` 금지였는데 09-28 에 사장님이
//   첫 화면 한 자리를 열었다(두 번 확인: 「이대로 적용해줘」 · 「아니 지금 목업 그대로 적용해줘」).
//
// ★★ 그래서 이 판은 "영상이 있다"를 재는 것이 **아니다.** 영상을 두되 09-07 과 달라진
//   **네 가지를 그대로 유지하는지**를 잰다. 이 넷 중 하나라도 무너지면 그때 그 사고다:
//     ① 정적 파일에서만 받는다(`/reel/…`) — `/api/renders/…` 는 요청마다 함수 + Supabase egress 다
//     ② 처음에는 **표지만** 깐다 — 영상은 `src` 가 아니라 `data-src` 로 들고 있다
//     ③ 브라우저가 미리 받지 않는다 — `preload="none"`
//     ④ 저절로 도는 것은 **둘뿐**이다(`lead`)
// ⚠️ 여기를 고쳐서 초록을 만들지 마라. 고쳐야 하면 **얼마나 더 나가는지 먼저 재고**
//   그 수치를 OUTSTANDING.md 에 적어라.
import { describe, it, expect } from "vitest";
import { readFileSync, statSync, existsSync } from "node:fs";
import { COLLAGE } from "../lib/home-collage.js";

const jsx = readFileSync("components/HomeCollage.jsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
// 주석을 걷은 판 — 이 저장소가 여러 번 밟았다(설명에 적어 둔 말이 코드로 세어진다).
const code = jsx
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("첫 화면 콜라주 — 전송량 방어선", () => {
  it("★★★ 영상을 **미리 받지 않는다** — src 가 아니라 data-src 로 들고 있다", () => {
    expect(code, "video 에 src 를 직접 적었다 — 열한 편이 방문마다 다 나간다")
      .not.toMatch(/<video[^>]*\ssrc=/);
    expect(code, "data-src 가 없다 — 눌러도 받을 주소가 없다").toMatch(/data-src=/);
    expect(code, 'preload="none" 이 없다').toMatch(/preload="none"/);
  });

  it("★★★ 영상은 **정적 파일**에서만 온다 — 함수도 Supabase 도 안 깬다", () => {
    expect(code, "정적 자리(/reel/)에서 안 받는다").toMatch(/\/reel\//);
    expect(code, "09-07 사고의 그 주소(/api/renders/)를 다시 문다").not.toMatch(/api\/renders/);
  });

  it("★★★ 저절로 도는 것은 **둘뿐**이다", () => {
    const leads = COLLAGE.filter((t) => t.lead === true);
    expect(leads.length, "자동 재생이 둘이 아니다 — 늘렸으면 전송량을 재고 인계에 적어라").toBe(2);
  });

  it("★★ 자동 재생하는 둘은 **가벼운 편**이다 — 합이 200KB 를 넘지 않는다", () => {
    // 이 둘이 방문마다 그대로 나간다. 09-28 실측 169KB(v04 96 + v11 73).
    let sum = 0;
    for (const t of COLLAGE.filter((x) => x.lead)) {
      const f = `public/reel/${t.file}.mp4`;
      expect(existsSync(f), `${f} 이 없다`).toBe(true);
      sum += statSync(f).size;
    }
    expect(Math.round(sum / 1024), "자동 재생 둘의 합이 커졌다").toBeLessThanOrEqual(200);
  });

  it("★★ 표지와 영상이 **짝으로** 다 있다 — 한쪽만 있으면 빈 칸이 생긴다", () => {
    for (const t of COLLAGE) {
      expect(existsSync(`public/reel/${t.file}.jpg`), `${t.file}.jpg 이 없다`).toBe(true);
      expect(existsSync(`public/reel/${t.file}.mp4`), `${t.file}.mp4 이 없다`).toBe(true);
    }
  });

  it("★★ 줄인 클립만 올린다 — 완성본 원본(편당 ~20MB)을 올리면 여기서 걸린다", () => {
    for (const t of COLLAGE) {
      const kb = statSync(`public/reel/${t.file}.mp4`).size / 1024;
      expect(Math.round(kb), `${t.file}.mp4 이 크다 — 360px·6초로 줄여서 올려라`).toBeLessThan(400);
    }
  });

  it("★★★ 칸의 **개수와 번호**가 표와 CSS 에서 같다 — 어긋나면 칸이 왼쪽 위에 포개진다", () => {
    // 자리는 CSS(.p1~.pN)가, 편은 lib/home-collage.js 가 들고 있다. 두 벌이라 갈릴 수 있다.
    for (let i = 1; i <= COLLAGE.length; i += 1) {
      expect(css, `${i} 번 칸의 자리가 CSS 에 없다`).toContain(`.home .p${i} `);
    }
    expect(css, `${COLLAGE.length + 1} 번 칸 자리가 CSS 에만 있다 — 표와 맞춰라`)
      .not.toContain(`.home .p${COLLAGE.length + 1} `);
  });

  it("★★ 시차와 커지는 연출이 **서로 다른 자리**를 쓴다", () => {
    // 시차는 매 프레임 바깥(.land-plate)의 transform 을 쓴다. 커지는 연출을 같은 자리에 걸면
    // 스크롤할 때마다 지워진다 — 그래서 안쪽(.land-plate-in)이 맡는다.
    expect(code, "시차가 바깥 판을 안 민다").toMatch(/\.style\.transform\s*=/);
    expect(css, "커지는 연출이 안쪽이 아니다")
      .toMatch(/\.home \.land-plate:hover \.land-plate-in[\s\S]{0,120}scale\(/);
  });
});
