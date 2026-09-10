// 표지의 **원천** — 올린 사진이 죽었으면 영상에서 뽑는다 (2026-09-10 사장님 지시).
//
// ★★★ 무엇이 문제였나. 랜딩 벽이 **다섯 칸**뿐이었다. 굽는 스크립트가 후보를
//   `image_url.startsWith("/api/uploads/")` 로만 고르는데, 그 사진 대부분이 09-07 에 못
//   옮긴 **옛 Supabase** 에 있어 404 다(전수 실측: 우리 저장소 영상 41편 중 **37편이 404**).
//
// ★★ 그런데 **영상은 살아 있다** — fal 주소 10편(fal CDN, 6일 된 것도 206) + 우리 저장소
//   4편. 그래서 표지를 올린 사진이 아니라 **영상의 첫 장면**에서 뽑는다.
//
// ★ 전송량이 이 결정의 핵심이다(09-07 에 Supabase 무료 5GB 를 넘겨 서비스가 죽었다).
//   실측: mp4 색인(moov)이 **오프셋 36**(맨 앞)이라 **앞 64KB** 만 받아도 프레임이 나온다.
//   영상 전체는 3.9MB — **1.6%** 다. 살아 있는 우리 저장소 4편이면 합계 256KB.
//
// ★ 그리고 산출물 모양은 **안 바꾼다**(`public/showcase/NN.webp` + `lib/showcase.js`).
//   상용화하며 이 칸이 **영상으로 바뀔 예정**인데(사장님), 그때 같은 자리에 짧은 무음
//   미리보기를 구우면 나머지가 안 바뀐다. 정적 파일이라 그때도 **Supabase 전송은 0**이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("scripts/showcase-refresh.mjs", "utf8");

describe("표지 굽기 — 후보를 좁히지 않는다", () => {
  it("★★★ 올린 사진이 있는 편만 고르지 않는다 — 그 조건이 벽을 다섯 칸으로 만들었다", () => {
    expect(src, '아직 image_url 이 "/api/uploads/" 인 편만 후보로 본다')
      .not.toMatch(/image_url\s*&&\s*p\.image_url\.startsWith\("\/api\/uploads\/"\)/);
  });

  it("★★★ 영상에서 프레임을 뽑는 길이 있다", () => {
    expect(src, "ffmpeg 를 안 쓴다 — 영상에서 표지를 못 뽑는다").toMatch(/ffmpeg/i);
  });

  it("★★★ 영상을 **통째로 받지 않는다** — 범위 요청으로 앞부분만", () => {
    // 이 한 줄이 09-07 을 되풀이하지 않게 하는 자리다. 41편을 통째로 받으면 155MB 다.
    expect(src, "Range 요청이 없다 — 영상 전체를 받게 된다").toMatch(/Range|bytes=/);
  });
});

describe("표지 굽기 — 산출물 모양은 그대로다", () => {
  it("★★ 정적 파일 + 순수 데이터 목록을 그대로 낸다", () => {
    // 나중에 이 칸이 영상으로 바뀌어도 이 모양이면 화면·배포가 안 바뀐다.
    expect(src).toMatch(/public\/showcase/);
    expect(src).toMatch(/lib\/showcase\.js/);
    expect(src, "확장자가 webp 가 아니다 — 화면과 목록이 갈린다").toMatch(/\.webp/);
  });
});
