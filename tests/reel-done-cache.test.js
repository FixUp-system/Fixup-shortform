// 다시 구운 완성본이 **화면에 반영되는가** (2026-08-25 사장님 실측).
//
// ★★ 완성본 주소는 다시 구워도 **늘 같다** — `/api/renders/<프로젝트id>.mp4`.
//   그래서 `<video>` 가 브라우저에 남은 옛 파일을 그대로 쓴다. 단계별 흐름은 이걸 알고
//   각인(render.ts)을 질의문자로 실어 막아 뒀는데(app/create/[id]/done/page.js),
//   **reel 은 그 처방을 안 빌려 왔다.**
//
// ⚠️ 이것 때문에 사장님이 "자막이 안 바뀐다"를 겪었다. (진짜 원인은 따로 있었지만 —
//   통짜 갈래에서 자막이 첫 문장만 깔렸다 — 이 캐시가 확인 자체를 막았다.)
//
// ★ 라우트의 ETag 도 같은 값을 읽는다(app/api/renders/[name]/route.js) — 없으면 ETag 가
//   아예 안 나가 같은 사람이 다시 볼 때마다 전량(8~13MB)이 다시 전송된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const strip = (src) =>
  src
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const page = strip(readFileSync("app/reel/[id]/done/page.js", "utf8"));
const route = strip(readFileSync("app/api/reel/[id]/render/route.js", "utf8"));

describe("완성본 각인", () => {
  it("★ 굽고 나서 **각인 시각**을 남긴다 — 없으면 붙일 값이 없다", () => {
    expect(route, "video 에 ts 를 안 남긴다").toMatch(/ts:\s*Date\.now\(\)/);
  });

  it("★ 화면이 그 각인을 주소에 싣는다 — 같은 주소면 옛 파일이 그대로 나온다", () => {
    expect(page).toMatch(/\?v=\$\{reel\.video\.ts/);
    // 옛 코드(질의문자 없음)가 남아 있으면 안 된다.
    expect(page).not.toMatch(/const finalSrc = reel\.video\?\.url \|\| null/);
  });

  it("각인이 없는 옛 문서도 안 깨진다 — 0 으로 떨어진다", () => {
    expect(page).toMatch(/reel\.video\.ts \|\| 0/);
  });

  it("★ 영상이 아예 없으면 null 이다 — 편집기가 그 값으로 재생기를 가른다", () => {
    expect(page).toMatch(/reel\.video\?\.url \?/);
  });
});

describe("단계별 흐름과 같은 처방이다", () => {
  it("create 완성 화면도 같은 모양이다 — 두 흐름이 갈리면 한쪽만 고쳐진다", () => {
    const create = strip(readFileSync("app/create/[id]/done/page.js", "utf8"));
    expect(create).toMatch(/\?v=\$\{render\.ts/);
  });
});
