import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";

// ★★ 이 시험이 지키는 것은 **빌드가 뜨는가**다. Next 는 같은 자리에 이름이 다른 동적
//   세그먼트를 못 둔다 — `app/film/[mode]` 와 `app/film/[id]` 가 함께 있으면 앱이 안 뜬다.
//   이 저장소의 화면 시험은 소스 문자열을 훑는 방식이라 그런 결함을 못 잡으므로,
//   **파일이 어디 있는가**를 값으로 잰다.
describe("옛 한 화면은 정적 세그먼트 아래로 비켰다", () => {
  it("★ app/film/[mode] 가 없다 — 있으면 app/film/[id] 와 부딪혀 빌드가 죽는다", () => {
    expect(existsSync("app/film/[mode]/page.js")).toBe(false);
  });

  it("★ 옛 화면은 지워지지 않고 살아 있다", () => {
    expect(existsSync("app/film/one/[mode]/page.js")).toBe(true);
  });

  it("★ 자기 자신을 가리키는 링크도 함께 옮겼다 — 안 옮기면 눌렀을 때 404 다", () => {
    const src = readFileSync("app/film/one/[mode]/page.js", "utf8");
    expect(src).not.toMatch(/href=\{`\/film\/\$\{m\.id\}`\}/);
    expect(src).not.toMatch(/href=\{`\/film\/\$\{other\.id\}\?id=/);
    expect(src).toMatch(/\/film\/one\//);
  });
});

// ★★ **바깥에서 들어오는 길도 함께 옮겨야 한다**(2026-08-20 사고).
//
// 화면을 옮기면서 자기 안의 링크 셋만 고쳤다. 그런데 이 화면으로 들어오는 문은 바깥에
// 둘 더 있었다 — 사이드바 메뉴와 보관함의 [이어서 작업]. 둘 다 404 가 됐고, 사장님이
// 앱을 쓰던 중에 그것을 밟았다.
//
// ★ 방식 이름(order·refs)이 `/film/` 바로 뒤에 오는 주소는 이제 **없어야 한다**.
//   그 자리는 프로젝트 id 의 자리이고, 방식은 `/film/one/<방식>` 아니면
//   `/film/<id>/<방식>/…` 에만 온다. 문자열로 재는 이유는 이 저장소에 렌더 하네스가
//   없어서다 — 링크가 실제로 열리는지는 못 재지만, **옛 모양이 남아 있는지**는 잴 수 있다.
describe("바깥에서 들어오는 길", () => {
  const DOORS = ["components/Sidebar.jsx", "app/archive/[id]/page.js"];

  it("★ 방식 이름이 /film/ 바로 뒤에 오는 주소가 없다 — 그 자리는 프로젝트 id 다", () => {
    for (const f of DOORS) {
      const src = readFileSync(f, "utf8");
      // `/film/order` · `/film/refs` · `/film/${m.id}` 같은 옛 모양
      expect(src, f).not.toMatch(/\/film\/(order|refs)\b/);
      expect(src, f).not.toMatch(/\/film\/\$\{[a-zA-Z.]*\bm\.id\}/);
    }
  });

  it("★ 그래도 들어가는 길은 남아 있다 — 문을 닫아 버리면 아무도 못 쓴다", () => {
    for (const f of DOORS) {
      expect(readFileSync(f, "utf8"), f).toMatch(/\/film\//);
    }
  });
});
