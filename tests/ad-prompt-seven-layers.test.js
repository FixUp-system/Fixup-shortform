// 광고 지문이 **영상 프롬프트 한 편**을 쓰게 한다 — 2026-08-27 구조 개편의 계약.
//
// ★★ 왜 다시 썼나: 사장님이 다른 곳에서 **실제로 잘 나온** 영상 프롬프트 4편을 주었다
//   (referenece/). 넷을 나란히 재니 우리 지문이 시키던 것과 정면으로 어긋나는 자리가
//   다섯이었다 — 장면 번호·초 금지 / 연출 지정 금지 / 장면 수 상한 / text 4,000자 상한 /
//   그리고 넷 다 갖고 있던 **참조 보존 지시와 Negative 가 우리에겐 없었다.**
//   실측 길이: 1,522 · 1,467 · 4,192 · 3,018자 (최장이 우리 상한에서 잘렸다).
//
// ★ 구조가 뒤집혔다. 그전에는 칸을 따로 받아 **코드가 프롬프트 꼬리에 절 일곱 개를
//   덧붙였다.** 이제 Fable 이 처음부터 한 편을 쓰고 코드는 아무것도 안 붙인다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AD_SYSTEM, buildScenarioMessages, photoBlocks, generateScenario, validateScenario } from "../lib/ad/scenario.js";
import { systemFor as filmSystemFor } from "../lib/film/scenario.js";
import { withSpokenLines } from "../lib/ad/generate.js";

const settings = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0", resolution: "720p",
};
const AD = AD_SYSTEM;

describe("일곱 단을 다 요구한다", () => {
  // ★ 단 이름이 아니라 **각 단이 요구하는 일**을 잰다 — 번호만 맞고 내용이 빠지면
  //   지문이 제 몫을 못 한다.
  const layers = [
    ["1 총괄", "총괄 한 문장"],
    ["2 참조", "참조 사진"],
    ["3 인물", "인물과 옷"],
    ["4 장면", "장면 진행과 대사"],
    ["5 카메라", "카메라·조명·색"],
    ["6 소리", "소리"],
    ["7 금지", "Negative"],
  ];
  for (const [name, phrase] of layers) {
    it(`${name} 단이 있다`, () => {
      expect(AD, `${name} 단이 사라졌다`).toContain(phrase);
    });
  }

  it("일곱 단이 번호 순서대로 나온다 — 순서가 곧 프롬프트의 순서다", () => {
    // ★ 낱말이 아니라 **번호 붙은 머리말**로 잰다. "소리"·"참조" 같은 낱말은 본문 다른
    //   자리에도 나와서, 낱말로 재면 순서가 아니라 우연히 먼저 나온 자리를 잰다.
    const at = layers.map(([name]) => AD.indexOf(`${name[0]}. **`));
    for (let i = 1; i < at.length; i++) {
      expect(at[i], `${layers[i][0]} 이 앞 단보다 먼저 나온다`).toBeGreaterThan(at[i - 1]);
    }
  });
});

// ★★★ 2026-08-27 리뷰에서 만든 그물. 지문을 7,351자에서 다시 쓰면서 **옛 규칙 넷이 조용히
//   사라졌다** — 그리고 어느 시험도 그것을 안 봤다(새 지문이 무엇을 갖는지만 쟀지, 옛 지문이
//   갖고 있던 것을 잃지 않았는지는 아무도 안 쟀다).
//
//   잃었던 넷: 세로 구도 · 대사 길이 · 화자 하나 · 사장님이 적은 장소 지키기.
//   넷 다 실측 사고에서 나온 규칙이다(특히 장소: 소재가 "퇴근하고 집에서 조리해 먹는"인데
//   무대에 스튜디오가 섞였다 — 2026-08-19).
//
// ⚠️ 이 목록에서 줄을 **지우지 마라.** 지문을 다시 쓸 때마다 여기와 대조하는 것이 이 파일의
//   일이다. 규칙을 정말로 폐기하기로 정했다면 그때 이유를 적고 지운다.
describe("★ 옛 지문이 갖고 있던 규칙을 잃지 않았다", () => {
  const kept = [
    ["초 합계가 전체 길이와 같다", "합이 전체 길이와 같아야"],
    ["세로면 세로 구도로 짠다", "세로 구도로"],
    ["대사는 짧게 — 넘치면 잘라 먹는다", "**대사는 짧게.**"],
    ["누가 말하는가(화면 안/밖)", "화면 속 인물이 입을 열어"],
    ["대사를 프롬프트 안에 원문 그대로", "그 장면 안에 녹여"],
    ["화면에 글자를 요구하지 마라", "화면에 글자를 넣으라고"],
    ["컷 편집을 지시하지 마라", "컷 편집 지시"],
    ["모델이 못 만드는 것을 요구하지 마라", "인포그래픽"],
    ["사진이 있으면 무엇을 지킬지 적는다", "무엇을 그대로 지켜야 하는지"],
    ["되묻지 말고 완성해서 낸다", "되묻지 말고"],
    ["한 영상에 화자는 하나다", "한 영상에 화자는 하나다"],
    ["사장님이 적은 장소를 지킨다", "스튜디오화하지 마라"],
    ["사장님이 적은 이야기가 이야기다", "그것이 이야기다"],
    ["장면을 잘게 쪼개면 끊긴다", "잇는 자리가 늘고"],
  ];
  for (const [name, needle] of kept) {
    it(name, () => {
      expect(AD, `"${name}" 규칙이 지문에서 사라졌다`).toContain(needle);
    });
  }
});

describe("Negative 필수 넷을 못 박는다 — 우리가 실제로 겪은 사고들이다", () => {
  it("화면 글자 — 사장님이 본 KONKUK UNVV 가 이것이다", () => {
    expect(AD).toContain("화면에 뜨는 글자");
  });
  it("손가락 — 이 저장소가 겪은 손 셋 사고", () => {
    expect(AD).toContain("손가락 수가 틀리거나");
  });
  it("얼굴·옷이 도중에 바뀌는 것", () => {
    expect(AD).toContain("얼굴이나 옷이 바뀌는 것");
  });
  it("없던 글자·로고를 지어내는 것", () => {
    expect(AD).toContain("없던 글자·로고를 지어내는 것");
  });
});

describe("사장님이 말한 규칙 하나 — 한국어 정확성", () => {
  it("맞춤법·띄어쓰기·고유명사를 못 박는다", () => {
    expect(AD).toContain("맞춤법");
    expect(AD).toContain("띄어쓰기");
  });

  // ★★★ 이 줄이 없던 채로 개편이 나갈 뻔했다(2026-08-27 검증에서 잡았다).
  //   옛 구조에는 `shots[].say_as` 라는 **읽는 표기** 칸과 fal 프롬프트의 Pronunciation 절이
  //   있었고, 그것을 걷어내면서 방어가 통째로 사라졌다. 실측 사고 그대로다:
  //     "Giants 에디션"  → "지에이턴스 에디전"
  //     "에스더버니 키링" → "에스터버리 키링"
  //   자막을 나중에 붙이기로 했으니 칸을 되살리지는 않는다 — 대사 표기 자체를 읽히는 대로
  //   쓰게 한다(자막이 붙는 날 line 과 say_as 를 다시 갈라야 하면 그때 나눈다).
  it("★ 읽히는 대로 적으라고 말한다 — 영어 낱말·붙여 쓴 고유명사가 뭉개진다", () => {
    expect(AD).toContain("읽히는 대로 적는다");
    expect(AD).toContain("철자대로 읽어");
    expect(AD).toContain("한글로 풀어 쓰거나 띄어 써서");
  });
});

describe("길이 — 참조 넷의 실측 범위를 그대로 시킨다", () => {
  it("1,500~4,500자를 요구한다", () => {
    expect(AD).toContain("1,500자에서 4,500자");
  });

  // ★★ 옛 상한 4,000 에서는 참조 최장(4,192자)이 **잘렸다.**
  it("validateScenario 가 6,000자까지 실어 나른다", () => {
    const long = "x".repeat(6500);
    const out = validateScenario({ text: long, shots: [{ beat: "가", seconds: 15 }] }, 0);
    expect(out.text.length).toBe(6000);
  });
});

describe("★ 예시 문장을 한 줄도 안 준다 — 이 저장소는 예시 오염을 두 번 겪었다", () => {
  // ★ 목소리 ✓ 예시를 6/8 이 글자 그대로 베꼈고(2026-08-24), 옷차림은 3/3 이었다(4cf7af0).
  //   그래서 결과가 늘 같은 사람·같은 옷이었다. 단 이름과 무엇이 들어가는지만 말한다.
  it("✓/✗ 예시 표시가 없다", () => {
    expect(AD).not.toContain("✓");
    expect(AD).not.toContain("✗");
    expect(AD).not.toContain("e.g.");
  });

  it("베껴진 그 문장이 없다", () => {
    expect(AD).not.toContain("woman in her late twenties");
    expect(AD).not.toContain("charcoal wool blazer");
  });
});

describe("걷어낸 칸을 지문이 더는 안 묻는다", () => {
  // ★ 이 값들은 전부 영상 프롬프트(text) 안으로 들어갔다. 칸으로 또 받으면 같은 것을
  //   두 번 적게 하는 셈이고, 실제로 그 칸들이 꼬리에 절로 붙어 text 와 중복됐다.
  for (const f of ["(cast)", "(wardrobe)", "(look)", "(tone)", "(music)", "(environment)", "focus 칸", "say_as", "speaker", "shows", "avatar_id"]) {
    it(`${f} 를 안 묻는다`, () => {
      expect(AD, `${f} 가 아직 지문에 있다`).not.toContain(f);
    });
  }

  it("남은 것은 셋뿐이다 — text · angle · shots", () => {
    expect(AD).toContain('"text"');
    expect(AD).toContain('"angle"');
    expect(AD).toContain('"shots"');
  });

  // ★ shots 를 **부산물**이라고 못 박는다 — 여기가 본 일이라고 착각하면 text 가 얇아진다.
  it("shots 는 자막용 목록이라고 말한다", () => {
    expect(AD).toContain("자막을 태우려고 우리가 쓰는 목록");
    expect(AD).toContain("영상 모델은 이 목록을 보지 않는다");
  });
});

describe("★ film 지문은 손대지 않았다 — 광고만 바꾼 것이지 둘 다가 아니다", () => {
  const film = filmSystemFor();
  it("film 은 예전 그대로 칸들을 묻는다", () => {
    for (const f of ["(cast)", "(wardrobe)", "(look)", "(tone)", "(music)", "shows", "avatar_id"]) {
      expect(film, `film 에서 ${f} 가 사라졌다`).toContain(f);
    }
  });
  // ★ 두 지문이 이제 **다른 파일**에 산다 — 갈래를 고르는 함수 자체가 사라졌다.
  it("광고 지문과 film 지문이 서로 다른 글이다", () => {
    expect(AD).not.toBe(film);
  });
});

describe("사진을 Fable 에 직접 붙인다 — gpt-4o 통역을 걷어냈다", () => {
  const project = (photos) => ({ id: "p1", kind: "ad", settings, material: { text: "소재", photos } });
  const bytes = Buffer.from("PNGDATA");
  const readRefBytes = async () => bytes;

  it("사진마다 base64 이미지 블록을 만든다", async () => {
    const out = await photoBlocks(project([{ url: "/api/uploads/a.jpg" }, { url: "/api/uploads/b.png" }]), { readRefBytes });
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: bytes.toString("base64") },
    });
    expect(out[1].source.media_type).toBe("image/png");
  });

  it("사진이 없으면 블록도 없다", async () => {
    expect(await photoBlocks(project([]), { readRefBytes })).toEqual([]);
  });

  // ★ 틀린 media_type 을 보내면 요청 **전체가 400** 이다 — 한 장 때문에 다 죽이지 않는다.
  it("모르는 확장자는 건너뛴다", async () => {
    expect(await photoBlocks(project([{ url: "/api/uploads/a.heic" }]), { readRefBytes })).toEqual([]);
  });

  it("못 읽은 사진은 건너뛴다 — 시나리오를 못 만들 이유가 아니다", async () => {
    const out = await photoBlocks(project([{ url: "/api/uploads/a.jpg" }]), { readRefBytes: async () => null });
    expect(out).toEqual([]);
  });

  // ★ Anthropic 은 이미지 한 장에 5MB 상한을 둔다.
  it("5MB 를 넘는 사진은 건너뛴다", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    const out = await photoBlocks(project([{ url: "/api/uploads/a.jpg" }]), { readRefBytes: async () => big });
    expect(out).toEqual([]);
  });

  it("★ 실제 호출에서 사진이 글보다 **앞**에 실린다", async () => {
    let seen = null;
    await generateScenario({
      project: project([{ url: "/api/uploads/a.jpg" }]),
      deps: {
        readRefBytes,
        callJson: async (args) => { seen = args; return { text: "P", angle: "이야기", shots: [{ beat: "가", seconds: 15 }] }; },
      },
    });
    const content = seen.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0].type).toBe("image");
    expect(content[content.length - 1].type).toBe("text");
  });

  // ★ 사진이 없으면 content 가 **문자열**이다 — 옛 호출 자리가 글자 그대로 안 바뀐다.
  it("사진이 없으면 content 는 예전처럼 문자열이다", async () => {
    let seen = null;
    await generateScenario({
      project: project([]),
      deps: { callJson: async (args) => { seen = args; return { text: "P", angle: "가", shots: [{ beat: "가", seconds: 15 }] }; } },
    });
    expect(typeof seen.messages[0].content).toBe("string");
  });
});

describe("★★ 코드가 프롬프트에 아무것도 안 붙인다 — 사장님이 준 성공 프롬프트가 그 모양이다", () => {
  const scenario = {
    text: 'A 15-second ad. The narrator says "안녕하세요".',
    angle: "한국어 이야기 한 줄",
    shots: [{ beat: "등장", line: "안녕하세요", seconds: 15 }],
    // 옛 문서에서 흘러들어올 수 있는 값들 — 하나도 안 붙어야 한다.
    cast: "a woman", wardrobe: "a coat", environment: "a cafe", look: "a jar",
    tone: "warm grain", voice: "a calm man",
  };

  // ★★ withSpokenLines 는 이제 **대사 보강만** 한다. 나머지 일곱 절은 film 으로 갔다
  //   (lib/film/pipeline.js 의 filmClauses) — 인자도 둘로 줄었다.
  it("대사가 이미 들어 있으면 프롬프트가 글자 그대로 나간다", () => {
    expect(withSpokenLines(scenario.text, scenario.shots)).toBe(scenario.text);
  });

  it("한국어 angle 이 영어 프롬프트 안으로 새지 않는다", () => {
    const out = withSpokenLines(scenario.text, scenario.shots);
    expect(out).not.toContain("한국어 이야기 한 줄");
    expect(out).not.toContain("The story this film tells");
  });

  it("옛 문서의 무대·옷차림·목소리 절도 안 붙는다", () => {
    const out = withSpokenLines(scenario.text, scenario.shots);
    for (const s of ["The whole film takes place", "Wardrobe, keep identical", "Voice:", "Color treatment"]) {
      expect(out, `${s} 절이 아직 붙는다`).not.toContain(s);
    }
  });

  // ★ 다만 **대사 보강은 남긴다.** 프롬프트에 대사가 빠지면 모델이 자기가 지어낸 말을 하고
  //   자막과 전혀 다른 영상이 나온다(2026-08-19 실측). 그것이 이 함수가 생긴 이유다.
  it("대사가 text 에 빠져 있으면 보강한다", () => {
    const out = withSpokenLines("A 15-second ad with no dialogue written.", scenario.shots);
    expect(out).toContain("안녕하세요");
    expect(out).toContain("word for word");
  });
});

describe("목소리를 고르는 축이 어디에도 안 남았다", () => {
  // ★★ 2026-08-24 에 칩 일곱 개를 만들었다가 2026-08-27 에 걷었다. 나레이션은 시나리오·
  //   분위기·화면 속 인물에 맞아야 하는 것이지 밖에서 못 박을 것이 아니다 — 영상 모델이
  //   입 모양에 맞춰 목소리를 고르는 것과 정면으로 싸운다.
  const files = [
    "lib/ad/options.js", "lib/ad/scenario.js",
    "components/AdOptionTray.jsx", "app/ads/new/page.js", "app/ads/[id]/page.js",
  ];
  for (const f of files) {
    it(`${f} 에 AD_VOICES·voice_style 이 없다`, () => {
      // 주석은 걷고 잰다 — 왜 걷어냈는지를 설명하는 주석이 그 이름을 쓴다.
      const code = readFileSync(f, "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
      expect(code, "AD_VOICES 가 남아 있다").not.toContain("AD_VOICES");
      expect(code, "voice_style 이 남아 있다").not.toContain("voice_style");
    });
  }
});

describe("★ 지문이 실제로 짧아졌다 — 규칙 목록에서 양식으로", () => {
  it("광고 지문이 film 지문보다 짧다", () => {
    expect(AD.length).toBeLessThan(filmSystemFor().length);
  });

  // ★ 사진이 있을 때만 참조 이름 안내가 붙는다(모델마다 표기가 다르다 — @Image1 vs Image 1).
  it("사진이 있으면 그 모델의 호칭으로 가리키라고 알려 준다", () => {
    const withPhoto = buildScenarioMessages({
      settings, material: { text: "소재", photos: [{ url: "/api/uploads/a.jpg" }] },
    }).messages[0].content;
    expect(withPhoto).toContain("@Image1");
    const h3 = buildScenarioMessages({
      settings: { ...settings, model: "minimax-h3" }, material: { text: "소재", photos: [{ url: "/api/uploads/a.jpg" }] },
    }).messages[0].content;
    expect(h3).toContain("Image 1");
  });

  // ★ 없는 칸(look·shows)을 가리키는 지시가 광고 user 메시지에 남아 있으면 모델이 헷갈린다.
  it("광고 user 메시지가 없는 칸을 가리키지 않는다", () => {
    const u = buildScenarioMessages({
      settings, material: { text: "소재", photos: [{ url: "/api/uploads/a.jpg" }] },
    }).messages[0].content;
    expect(u).not.toContain("look 에서는");
    expect(u).not.toContain("shows");
  });
});
