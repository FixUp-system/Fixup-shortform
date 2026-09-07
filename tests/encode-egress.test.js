// 인코딩 설정이 전송량(egress)에 미치는 것 — 2026-09-07.
//
// ★ 왜 생겼나. Supabase 가 전송 할당량 초과로 프로덕션을 402 로 막았다. 새는 자리를
//   되짚다가 인코더에서 둘이 빠져 있는 것을 찾았다. **둘 다 실측했다**
//   (`reel-final.mp4` 3,047 KB 를 다시 인코딩한 값):
//
//   | 설정 | 크기 | 절감 |
//   |---|---|---|
//   | 지금(기본 crf 23) | 2,821 KB | — |
//   | crf 26 + faststart | 2,151 KB | **−29%** |
//   | crf 28 + faststart | 1,752 KB | −42% |
//   | crf 26 + preset slow | 2,077 KB | −31% (인코딩 시간만 크게 늘어 값어치 없다) |
//
// ★ faststart 는 크기를 안 줄이지만 **moov 를 파일 앞으로 옮긴다.** 없으면 재생기가
//   재생 전에 파일 **끝**을 먼저 받아야 한다 — 카드에서 마우스만 올려도 두 번 왕복한다.
//   실측으로 이 저장소의 산출물은 moov 가 뒤에 있었다.
//
// ★ crf 를 안 적으면 libx264 의 기본값(23)이 쓰인다. 그건 **우리가 고른 값이 아니라
//   라이브러리의 기본값**이다 — 화질과 돈이 걸린 값은 우리가 적어야 바꿀 수 있다.
import { describe, it, expect } from "vitest";
import { buildFfmpegArgs, burnArgs } from "../lib/compose";

const local = [
  { video: "/t/0.mp4", audio: "/t/0.mp3", wantSeconds: 4, haveSeconds: 4 },
  { video: "/t/1.mp4", audio: "/t/1.mp3", wantSeconds: 6, haveSeconds: 6 },
];
const compose = () =>
  buildFfmpegArgs({ local, assPath: "/t/s.ass", out: "/t/o.mp4", width: 1080, height: 1920 });
const burn = () => burnArgs({ raw: "/t/raw.mp4", assPath: "/t/s.ass", out: "/t/o.mp4" });

// 값 뒤에 오는 인자를 집는다 — 순서가 바뀌어도 판이 안 깨진다.
const after = (args, flag) => args[args.indexOf(flag) + 1];

describe("합성 — 전송량을 정하는 인코딩 설정", () => {
  it("★ faststart 를 넣는다 — 없으면 재생 전에 파일 끝을 받아야 한다", () => {
    expect(after(compose(), "-movflags")).toContain("+faststart");
  });

  it("★ crf 를 명시한다 — 라이브러리 기본값(23)에 화질·돈을 맡기지 않는다", () => {
    expect(compose()).toContain("-crf");
  });
});

// ★ 자막을 굽는 갈래가 **사장님이 실제로 받는 파일**이다(자막이 있으면 이쪽이 최종본).
//   여기를 빼먹으면 절감이 절반만 걸린다.
describe("자막 굽기 — 같은 설정이 걸려야 한다", () => {
  it("★ faststart 가 여기에도 걸린다", () => {
    expect(after(burn(), "-movflags")).toContain("+faststart");
  });

  it("★ crf 도 여기에 걸린다", () => {
    expect(burn()).toContain("-crf");
  });

  it("소리는 여전히 다시 인코딩하지 않는다 — 자막을 고칠 때마다 열화되면 안 된다(회귀 방어)", () => {
    expect(burn()).toContain("copy");
  });
});
