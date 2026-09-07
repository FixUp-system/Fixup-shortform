// 카드용 작은 그림 — 2026-09-07.
//
// ★ 왜 생겼나. 카드에서 영상을 뺐더니(90dafec) 카드의 얼굴이 **원본 업로드 사진**이 됐다.
//   실측 355장 평균 **290KB**(중앙값 159KB · 최대 2.9MB)인데 카드는 화면에서 300~400px 다.
//   보관함 한 번 훑으면 그림 20장 × 290KB ≈ 5.8MB — 전송이 영상에서 사진으로 **옮겨간** 것뿐이다.
//
// ★ 실측 절감(sharp, w480 webp q72): 1024×766 59KB → **8KB(14%)** · 740×493 25KB → 6KB.
//   실제 업로드는 더 커서 절감폭이 더 크다.
//
// ★★ 함정 — **함수에서 그때그때 줄이면 Supabase 전송은 안 준다.** 함수가 원본을 여전히
//   내려받기 때문이다(줄어드는 것은 Vercel 쪽뿐). 그래서 **만든 것을 저장한다**:
//   다음 요청부터는 작은 것만 오간다. 저장하니 백필 스크립트도 필요 없다 — 옛 사진도
//   첫 조회에 저절로 최적화된다.
//
// ★ 저장된 주소(`/api/uploads/<uuid>.<ext>`)는 **안 바꾼다.** 그 문자열이 프로젝트 문서의
//   material.photos[].url 에 박혀 있다(uploads 라우트 머리말). 그래서 `?t=1` 로 요청한다.
import { describe, it, expect, beforeEach } from "vitest";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { thumbKeyFor, thumbUrl } from "../lib/thumb-url.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET as getUpload } from "../app/api/uploads/[name]/route.js";

const A = "11111111-1111-1111-1111-111111111111";
const NAME = "aaaaaaaa-1111-2222-3333-444444444444.jpg";
const req = (url) =>
  new Request(url, { headers: { [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" } });

const realJpeg = () =>
  sharp({ create: { width: 900, height: 600, channels: 3, background: "#3355ff" } }).jpeg().toBuffer();

describe("이름 규약 — 원본과 작은 판을 잇는 한 자리", () => {
  it("확장자를 갈아 끼운다", () => {
    expect(thumbKeyFor("abc.jpg")).toBe("abc-t.webp");
    expect(thumbKeyFor("abc.png")).toBe("abc-t.webp");
    expect(thumbKeyFor("abc.webp")).toBe("abc-t.webp");
  });

  it("★ 우리 경로에만 ?t=1 을 붙인다 — 외부 주소는 건드리지 않는다", () => {
    expect(thumbUrl("/api/uploads/abc.jpg")).toBe("/api/uploads/abc.jpg?t=1");
    // 실측: image_url 20개 중 3개가 fal 주소다. 여기에 붙이면 남의 캐시 키를 흔든다.
    expect(thumbUrl("https://v3b.fal.media/files/b/x.png")).toBe("https://v3b.fal.media/files/b/x.png");
    expect(thumbUrl(null)).toBe(null);
  });
});

// 만들어 놓고 안 쓰면 아무것도 안 준다 — 카드가 실제로 그 주소를 쓰는지 못 박는다.
describe("카드가 작은 판을 쓴다", () => {
  const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
  const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));

  it("★ <img> 의 주소가 thumbUrl 을 지난다", () => {
    expect(cards).toMatch(/thumbUrl\(/);
    expect(cards).toMatch(/src=\{thumbUrl\(/);
  });

  it("★ 카드는 순수 모듈만 읽는다 — sharp 가 클라이언트 번들에 실리면 빌드가 깨진다", () => {
    expect(cards).not.toMatch(/from\s+"[^"]*lib\/thumbs\.js"/);
    expect(cards).toMatch(/lib\/thumb-url/);
  });
});

describe("업로드 서빙 — 작은 판", () => {
  beforeEach(() => resetMemoryStore());

  const put = async () => {
    await memoryStore.putObject("uploads", NAME, await realJpeg(), "image/jpeg");
    await memoryStore.insertUploadOwner(NAME, A);
  };

  it("★ ?t=1 이면 작은 판을 만들어 주고 **저장한다** — 다음부터 원본을 안 받는다", async () => {
    await put();
    const res = await getUpload(req(`http://x/api/uploads/${NAME}?t=1`), {
      params: Promise.resolve({ name: NAME }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    const small = Buffer.from(await res.arrayBuffer());
    const orig = await memoryStore.getObject("uploads", NAME);
    expect(small.length, "작아지지 않았다").toBeLessThan(orig.length);
    // 저장까지 해야 전송이 준다 — 안 하면 매번 원본을 다시 받는다.
    await expect(memoryStore.getObject("uploads", thumbKeyFor(NAME))).resolves.toBeTruthy();
  });

  it("★ 이미 있으면 원본을 아예 안 읽는다 — 이 판이 절감의 전부다", async () => {
    await put();
    await memoryStore.putObject("uploads", thumbKeyFor(NAME), Buffer.from("작은판"), "image/webp");
    const seen = [];
    const real = memoryStore.getObject.bind(memoryStore);
    memoryStore.getObject = async (b, k) => { seen.push(k); return real(b, k); };
    try {
      const res = await getUpload(req(`http://x/api/uploads/${NAME}?t=1`), {
        params: Promise.resolve({ name: NAME }),
      });
      expect(res.status).toBe(200);
      expect(seen, "작은 판이 있는데 원본을 읽었다").not.toContain(NAME);
    } finally {
      memoryStore.getObject = real;
    }
  });

  it("?t=1 이 없으면 원본 그대로다 — 상세·다운로드가 안 흐려진다(회귀 방어)", async () => {
    await put();
    const res = await getUpload(req(`http://x/api/uploads/${NAME}`), {
      params: Promise.resolve({ name: NAME }),
    });
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });
});
