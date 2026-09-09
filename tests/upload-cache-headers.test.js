// 표지 그림을 **엣지가 쥘 수 있게** 한다 — 그리고 그 문을 스위치에 묶는다 (2026-09-09).
//
// ★★★ 왜 생겼나. 사장님이 "렌더링 속도가 너무 느리다"고 해서 라이브를 쟀다:
//     표지 12장을 브라우저처럼 6개씩 받으면 **6.9초**(24장이면 ~14초).
//     한 장이 성공해도 평균 1.22초이고, 죽은 파일의 404 는 **3.34초**다.
//   원인의 큰 몫이 이것이었다 — 응답이 `private` 라 **CDN 이 하나도 못 쥔다.**
//   몇 번을 불러도 `X-Vercel-Cache: MISS` 이고, 그때마다 함수가 뜨고 Postgres 를 한 번
//   조회하고 Supabase Storage 를 한 번 내려받는다. **방문 한 번에 그 왕복이 25번**이다.
//   ★ 이것은 속도만의 문제가 아니다 — 2026-09-07 에 서비스를 죽인 그 전송량 모양 그대로다.
//     파일만 작아졌지(19KB) 방문마다 Supabase 에서 새로 꺼내는 구조는 안 바뀌었다.
//
// ★★★ 그런데 `public` 은 **아무 때나 켜면 안 된다.** 엣지에 남은 사본은 로그인 벽을
//   안 지난다 — 스위치가 꺼진 상태에서 `public` 이면 **로그인해야 볼 수 있는 사진이
//   주소만 아는 사람에게 열린다.** 그래서 문을 스위치에 묶는다:
//
//     손님 보관함 ON  → 그 라우트는 이미 **손님 GET 을 허용한다**(lib/auth/guest.js).
//                       즉 누구나 이미 받을 수 있다 — 엣지가 쥔다고 새로 열리는 것이 없다.
//     손님 보관함 OFF → 로그인 벽이 살아 있다 → `private` 를 지킨다.
//
//   ★ 판정을 **요청자**가 아니라 **서버 스위치**로 한다. 사람마다 다른 헤더를 주면
//     `Vary` 없이는 캐시가 섞이고, `Vary` 를 붙이면 캐시가 사실상 안 먹는다.
//
// ★ 원본(`?t=1` 없음)은 스위치와 무관하게 `private` 로 둔다. 랜딩이 쓰는 것은 작은 판뿐이라
//   여는 이득이 없고, 여는 범위는 좁을수록 좋다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET as getUpload } from "../app/api/uploads/[name]/route.js";

const A = "11111111-1111-1111-1111-111111111111";
const req = (url) => new Request(url, {
  headers: { [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" },
});
const call = (url, name) => getUpload(req(url), { params: Promise.resolve({ name }) });

// 진짜 jpeg 한 장 — makeThumb(sharp) 이 지나갈 수 있어야 작은 판 갈래가 끝까지 돈다.
async function seed() {
  const sharp = (await import("sharp")).default;
  const jpg = await sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 120, b: 90 } },
  }).jpeg().toBuffer();
  await memoryStore.putObject("uploads", "a.jpg", jpg, "image/jpeg");
  await memoryStore.insertUploadOwner("a.jpg", A);
}

const was = process.env.SHOTFORM_PUBLIC_ARCHIVE;

describe("표지 그림의 캐시 문 — 스위치에 묶는다", () => {
  beforeEach(async () => { resetMemoryStore(); await seed(); });
  afterEach(() => {
    if (was === undefined) delete process.env.SHOTFORM_PUBLIC_ARCHIVE;
    else process.env.SHOTFORM_PUBLIC_ARCHIVE = was;
  });

  it("★★★ 손님 보관함이 켜져 있으면 작은 판은 엣지가 쥔다", async () => {
    process.env.SHOTFORM_PUBLIC_ARCHIVE = "1";
    const res = await call("http://localhost/api/uploads/a.jpg?t=1", "a.jpg");
    expect(res.status).toBe(200);
    const cc = res.headers.get("Cache-Control") || "";
    expect(cc, "엣지가 못 쥔다 — 방문마다 함수와 Storage 를 왕복한다").toMatch(/\bpublic\b/);
    expect(cc, "private 가 남아 있으면 public 이 무의미하다").not.toMatch(/\bprivate\b/);
    expect(cc, "오래 쥐지 않으면 두 번째 방문이 또 느리다").toMatch(/max-age=\d{5,}/);
  });

  it("★★★ 스위치가 꺼져 있으면 작은 판도 private 다 — 로그인 벽을 엣지가 넘지 않는다", async () => {
    delete process.env.SHOTFORM_PUBLIC_ARCHIVE;
    const res = await call("http://localhost/api/uploads/a.jpg?t=1", "a.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control") || "", "로그인 벽 뒤 사진이 엣지에 남는다")
      .toMatch(/\bprivate\b/);
  });

  it("★★ 원본은 스위치가 켜져 있어도 private 다 — 여는 범위를 좁게 둔다", async () => {
    process.env.SHOTFORM_PUBLIC_ARCHIVE = "1";
    const res = await call("http://localhost/api/uploads/a.jpg", "a.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control") || "", "랜딩이 안 쓰는 큰 파일까지 열렸다")
      .toMatch(/\bprivate\b/);
  });

  it("★★★ 죽은 파일에 Storage 를 두 번까지만 두드린다 — 지금은 세 번이다", async () => {
    // 2026-09-09 라이브 실측: **404 가 성공보다 2.7배 느리다**(3.34초 vs 1.22초).
    // 표지 주소가 있는 25편 중 스무 편이 이것이라(09-07 파일 미이관) 랜딩의 느림에서
    // 가장 큰 몫이고, 그동안 브라우저 연결 슬롯을 잡아 **살아 있는 표지까지 뒤로 민다.**
    //
    // 원인은 헛걸음이다. 작은 판이 없으면 원본을 찾고(2), 그것도 없으면 예외가 위로
    // 튀어 바깥 갈래가 **원본을 또 찾는다**(3). 원본이 한 번 없었으면 두 번째도 없다.
    process.env.SHOTFORM_PUBLIC_ARCHIVE = "1";
    await memoryStore.insertUploadOwner("gone.jpg", A);   // 주인 기록만 있고 파일은 없다
    const real = memoryStore.getObject.bind(memoryStore);
    let hits = 0;
    memoryStore.getObject = (...a) => { hits += 1; return real(...a); };
    try {
      const res = await call("http://localhost/api/uploads/gone.jpg?t=1", "gone.jpg");
      expect(res.status).toBe(404);
      expect(hits, "없는 파일을 세 번 두드린다 — 한 번이 통째로 헛걸음이다").toBeLessThanOrEqual(2);
    } finally {
      memoryStore.getObject = real;
    }
  });

  it("★★ 죽은 파일의 404 도 잠깐은 엣지가 쥔다 — 스무 번을 매번 두드리지 않는다", async () => {
    // ★ 오래 쥐면 안 된다. 09-07 에 못 옮긴 파일을 나중에 되찾으면 그 404 가 캐시에
    //   박혀 살아난 사진을 가린다. 그래서 **짧게**만 쥔다(분 단위).
    process.env.SHOTFORM_PUBLIC_ARCHIVE = "1";
    await memoryStore.insertUploadOwner("gone2.jpg", A);
    const res = await call("http://localhost/api/uploads/gone2.jpg?t=1", "gone2.jpg");
    expect(res.status).toBe(404);
    const cc = res.headers.get("Cache-Control") || "";
    expect(cc, "404 를 아무도 안 쥔다 — 방문마다 20번을 다시 두드린다").toMatch(/\bpublic\b/);
    const m = cc.match(/max-age=(\d+)/);
    expect(m, "얼마나 쥘지 안 적혀 있다").not.toBe(null);
    expect(Number(m[1]), "너무 오래 쥔다 — 되찾은 사진이 가려진다").toBeLessThanOrEqual(600);
  });

  it("★★ 응답을 사람에 따라 가르지 않는다 — Vary 를 달지 않는다", async () => {
    // 판정을 **요청자**로 하면 사람마다 헤더가 갈리고, 그러면 `Vary` 없이는 엣지가
    // 남의 사본을 내주고 `Vary` 를 붙이면 캐시가 사실상 안 먹는다. 둘 다 나쁘다.
    // 그래서 서버 스위치 하나로만 가른다 — 그 결과가 "Vary 가 필요 없다"이다.
    // ★ 요청자를 바꿔 가며 부르는 것으로는 이걸 못 잰다(테스트 harness 가 신원을 헤더로
    //   심는데 손님 갈래는 middleware 가 세우는 맥락을 요구한다). 계약을 직접 잰다.
    process.env.SHOTFORM_PUBLIC_ARCHIVE = "1";
    const res = await call("http://localhost/api/uploads/a.jpg?t=1", "a.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("Vary"), "사람마다 갈리는 응답이 되면 캐시가 섞이거나 죽는다").toBe(null);
  });
});
