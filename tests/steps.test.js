import { describe, it, expect } from "vitest";
import {
  STEPS, currentStepKey, isReachable, areCutsStale, stepFromPathname, stepHref,
  clipKey, renderKey, isAudioStale, isImageStale, isClipStale, isRenderStale,
} from "../lib/steps.js";

describe("단계 정의", () => {
  it("구성이 빠져 6단계다 — 원고가 곧 설계다", () => {
    expect(STEPS.map((s) => s.key)).toEqual([
      "material", "script", "voice", "images", "video", "done",
    ]);
    expect(STEPS[1]).toMatchObject({ key: "script", label: "대본", seg: "script" });
  });

  it("목소리가 이미지 앞이다 — 낭독 길이가 컷 구조를 판정한다", () => {
    // TTS 실측이 cut.seconds 를 덮는다. 그 값이 10초를 넘으면 클립이 잘린다.
    // 이미지 값(컷당 후보 2장)을 치르기 전에 알아야 쪼갤 기회가 있다.
    const keys = STEPS.map((s) => s.key);
    expect(keys.indexOf("voice")).toBeLessThan(keys.indexOf("images"));
    expect(keys.indexOf("images")).toBeLessThan(keys.indexOf("video"));
  });

  it("준비 중 표시가 남아 있지 않다", () => {
    expect(STEPS.filter((s) => s.soon)).toEqual([]);
  });

  it("번호가 순서대로 붙어 있다", () => {
    expect(STEPS.map((s) => s.no)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("stepHref는 ①자료를 프로젝트 유무로 가른다", () => {
    const [material, script] = STEPS;
    expect(stepHref(material, null)).toBe("/create");
    expect(stepHref(material, "abc")).toBe("/create/abc/briefing");
    expect(stepHref(script, null)).toBeNull();
    expect(stepHref(script, "abc")).toBe("/create/abc/script");
  });
});

describe("stepFromPathname", () => {
  it("단계 경로를 그 단계로 읽는다", () => {
    expect(stepFromPathname("/create/abc/script").key).toBe("script");
    expect(stepFromPathname("/create/abc/images").key).toBe("images");
    expect(stepFromPathname("/create").key).toBe("material");
  });
  it("프로젝트 인덱스는 단계 미상 — ①자료로 오인하지 않는다", () => {
    expect(stepFromPathname("/create/abc")).toBeUndefined();
  });
  it("브리핑 경로를 ①자료로 읽는다", () => {
    expect(stepFromPathname("/create/abc/briefing").key).toBe("material");
  });
  it("없어진 구성 경로는 어떤 단계도 아니다", () => {
    expect(stepFromPathname("/create/abc/synopsis")).toBeUndefined();
  });
  it("모르는 경로는 undefined", () => {
    expect(stepFromPathname("/costs")).toBeUndefined();
    expect(stepFromPathname("")).toBeUndefined();
  });
});

describe("currentStepKey", () => {
  const confirmed = { confirmed: true };

  it("프로젝트가 없으면 자료 단계", () => {
    expect(currentStepKey(null)).toBe("material");
  });
  it("브리핑 확정 전에는 상태와 무관하게 자료 단계", () => {
    expect(currentStepKey({ status: "draft", briefing: null })).toBe("material");
    expect(currentStepKey({ status: "briefing", briefing: { confirmed: false } })).toBe("material");
  });
  it("확정하면 바로 대본 단계 — 구성 게이트가 사라졌다", () => {
    expect(currentStepKey({ status: "briefing", briefing: confirmed })).toBe("script");
  });
  // status 는 "마지막으로 끝난 산출물", currentStepKey 는 "다음에 열릴 화면"이다
  it("분할이 끝나면 목소리 차례", () => {
    expect(currentStepKey({ status: "cuts", briefing: confirmed })).toBe("voice");
  });
  it("목소리가 끝나면 이미지 차례", () => {
    expect(currentStepKey({ status: "voice", briefing: confirmed })).toBe("images");
  });
  it("뒤 단계 status 를 각각 읽는다", () => {
    // 이미지가 끝나도 완성은 사장님이 눌러야 시작된다 — 열려 있어야 할 화면은 ⑤영상이다
    expect(currentStepKey({ status: "images", briefing: confirmed })).toBe("video");
    expect(currentStepKey({ status: "video", briefing: confirmed })).toBe("video");
    expect(currentStepKey({ status: "done", briefing: confirmed })).toBe("done");
  });
  it("뒤 단계 판정을 앞보다 먼저 본다 — 앞서간 프로젝트를 끌어내리지 않는다", () => {
    // status 가 done 인데 cuts 조건에 먼저 걸려 되돌아가면, 완성본을 두고 뒤로 간다
    const finished = { status: "done", briefing: confirmed, cuts: [{ idx: 0 }] };
    expect(currentStepKey(finished)).toBe("done");
  });
  it("구성 시절 프로젝트도 status가 cuts면 목소리 차례 — 돈 주고 만든 컷에서 쫓아내지 않는다", () => {
    const old = { status: "cuts", briefing: confirmed, synopsis: { scenes: [] }, cuts: [{ id: "c1" }] };
    expect(currentStepKey(old)).toBe("voice");
  });
  it("대본을 고쳐 status가 script로 내려가면 컷이 남아 있어도 대본 단계 — 컷을 다시 뽑을 수 있다", () => {
    const p = { status: "script", briefing: confirmed, cuts: [{ id: "c1" }] };
    expect(currentStepKey(p)).toBe("script");
  });
});

describe("areCutsStale — 낡음의 방향이 뒤집혔다", () => {
  // 예전에는 대본이 구성에 대해 낡았다. 이제는 컷이 원고에 대해 낡는다.
  const cuts = [{ idx: 0 }];

  it("두 버전이 같으면 낡지 않았다", () => {
    expect(areCutsStale({ script: { version: 2 }, cuts, cuts_script_version: 2 })).toBe(false);
  });

  it("원고를 다시 쓰면 남은 컷은 낡은 것으로 본다", () => {
    expect(areCutsStale({ script: { version: 3 }, cuts, cuts_script_version: 2 })).toBe(true);
  });

  it("손으로 고친 원고는 version이 그대로다 — 거짓 경고를 띄우지 않는다", () => {
    // PATCH script_text는 version을 올리지 않는다. 사장님이 직접 고친 것에
    // "컷 다시 만들기"(유료 호출)를 권하면 안 된다.
    expect(areCutsStale({ script: { version: 2, text: "고친 원고" }, cuts, cuts_script_version: 2 })).toBe(false);
  });

  it("원고 도입 전에 만들어진 컷은 낡은 것으로 본다", () => {
    expect(areCutsStale({ script: { version: 1 }, cuts })).toBe(true);
  });

  it("컷이 없거나 원고가 없으면 판정하지 않는다", () => {
    expect(areCutsStale({ script: { version: 1 }, cuts: [] })).toBe(false);
    expect(areCutsStale({ cuts })).toBe(false);
    expect(areCutsStale(null)).toBe(false);
  });
});

describe("낡음 판정 — 산출물마다 무엇에서 나왔는지 각인한다", () => {
  describe("isAudioStale — 소리는 문장에서 나온다", () => {
    it("읽은 문장이 그대로면 낡지 않았다", () => {
      const cut = { sentence: "딸기를 갈아 씁니다.", audio: { url: "u", of: "딸기를 갈아 씁니다." } };
      expect(isAudioStale(cut)).toBe(false);
    });

    it("문장을 고치면 소리가 낡는다", () => {
      const cut = { sentence: "매일 딸기를 갈아 씁니다.", audio: { url: "u", of: "딸기를 갈아 씁니다." } };
      expect(isAudioStale(cut)).toBe(true);
    });

    it("각인이 없는 옛 소리는 낡지 않은 것으로 본다 — 거짓 경고가 유료 호출을 부른다", () => {
      expect(isAudioStale({ sentence: "문장", audio: { url: "u" } })).toBe(false);
    });

    it("소리가 아예 없으면 판정하지 않는다", () => {
      expect(isAudioStale({ sentence: "문장" })).toBe(false);
      expect(isAudioStale(null)).toBe(false);
    });
  });

  describe("isImageStale — 그림은 화면 설명에서 나온다", () => {
    it("화면 설명이 그대로면 낡지 않았다", () => {
      expect(isImageStale({ shows: "주인이 코트를 든다", image: { url: "u", of: "주인이 코트를 든다" } })).toBe(false);
    });

    it("화면 설명을 고치면 그림이 낡는다", () => {
      expect(isImageStale({ shows: "손님이 코트를 든다", image: { url: "u", of: "주인이 코트를 든다" } })).toBe(true);
    });

    it("문장만 고친 것은 그림을 낡게 하지 않는다 — 그림 두 장을 다시 사지 않는다", () => {
      const cut = { sentence: "고친 문장", shows: "주인이 코트를 든다", image: { url: "u", of: "주인이 코트를 든다" } };
      expect(isImageStale(cut)).toBe(false);
    });

    it("각인이 없거나 그림이 없으면 낡지 않은 것으로 본다", () => {
      expect(isImageStale({ shows: "설명", image: { url: "u" } })).toBe(false);
      expect(isImageStale({ shows: "설명" })).toBe(false);
    });

    // 화풍은 컷 밖(settings)에 있어서 project 를 함께 봐야 한다. isRenderStale 이 프로젝트를
    // 받는 것과 같은 모양이다. 화풍을 도입하기 전에는 화풍을 바꿔도 옛 실사 그림이 살아남아
    // 클립·완성본까지 갔다 — 판정이 화풍을 몰랐기 때문이다.
    describe("화풍도 그림의 근거다", () => {
      const cut = (styleOf) => ({
        shows: "주인이 코트를 든다",
        image: { url: "u", of: "주인이 코트를 든다", style_of: styleOf },
      });
      const proj = (preset, note) => ({ settings: { style: { preset, note } } });

      it("화풍을 바꾸면 그림이 낡는다", () => {
        expect(isImageStale(cut("photo|"), proj("illust"))).toBe(true);
      });

      it("같은 화풍이면 낡지 않았다", () => {
        expect(isImageStale(cut("illust|"), proj("illust"))).toBe(false);
      });

      it("보정 한 줄만 고쳐도 그림이 낡는다 — 그림이 실제로 달라지기 때문이다", () => {
        expect(isImageStale(cut("illust|파스텔"), proj("illust", "파스텔"))).toBe(false);
        expect(isImageStale(cut("illust|파스텔"), proj("illust", "차가운 색"))).toBe(true);
      });

      // of 각인과 같은 계약이다: 각인이 없는 옛 산출물은 낡지 않은 것으로 본다.
      // 거짓 경고의 버튼은 유료 호출이라, 화풍을 도입한 것만으로 옛 그림을 다시 사게 하면 안 된다.
      it("화풍 각인이 없는 옛 그림은 조용히 실사로 남는다", () => {
        expect(isImageStale({ shows: "설명", image: { url: "u", of: "설명" } }, proj("illust"))).toBe(false);
      });

      it("화면 설명이 바뀌면 화풍을 보기 전에 이미 낡았다", () => {
        expect(isImageStale({ shows: "다른 설명", image: { url: "u", of: "설명" } }, proj("photo"))).toBe(true);
      });

      // ⚠️ cuts.filter(isImageStale) 처럼 함수를 그대로 넘기면 배열 번호가 project 자리에
      //    들어간다. 그때도 화면이 죽지 않고 화풍 판정만 건너뛰어야 한다.
      it("프로젝트를 안 주면 화풍 판정을 건너뛴다", () => {
        expect(isImageStale(cut("illust|"))).toBe(false);
        expect(isImageStale(cut("illust|"), 3)).toBe(false);
      });
    });
  });

  describe("isClipStale — 클립은 그림·길이·움직임에서 나온다", () => {
    const base = { image: { url: "img1" }, seconds: 6, motion: "천천히 다가간다" };

    it("셋 다 그대로면 낡지 않았다", () => {
      expect(isClipStale({ ...base, video: { url: "v", of: clipKey(base) } })).toBe(false);
    });

    it("그림을 다시 만들면 주소가 바뀌어 클립이 낡는다", () => {
      const cut = { ...base, image: { url: "img2" }, video: { url: "v", of: clipKey(base) } };
      expect(isClipStale(cut)).toBe(true);
    });

    it("소리를 다시 만들어 길이가 바뀌면 클립이 낡는다 — 지금 조용히 틀리는 자리다", () => {
      const cut = { ...base, seconds: 9, video: { url: "v", of: clipKey(base) } };
      expect(isClipStale(cut)).toBe(true);
    });

    it("움직임을 고쳐도 클립이 낡는다", () => {
      const cut = { ...base, motion: "정지", video: { url: "v", of: clipKey(base) } };
      expect(isClipStale(cut)).toBe(true);
    });

    it("각인이 없거나 클립이 없으면 낡지 않은 것으로 본다", () => {
      expect(isClipStale({ ...base, video: { url: "v" } })).toBe(false);
      expect(isClipStale(base)).toBe(false);
    });
  });

  describe("isRenderStale — 완성본은 컷별 소리·클립·문장에서 나온다", () => {
    const cuts = [
      { idx: 0, sentence: "첫 문장", audio: { url: "a0" }, video: { url: "v0" } },
      { idx: 1, sentence: "둘째 문장", audio: { url: "a1" }, video: { url: "v1" } },
    ];
    const proj = { cuts };

    it("아무것도 안 바뀌었으면 낡지 않았다", () => {
      expect(isRenderStale({ ...proj, render: { url: "r", of: renderKey(proj) } })).toBe(false);
    });

    it("컷 하나의 소리를 다시 만들면 완성본이 낡는다", () => {
      const after = { cuts: [{ ...cuts[0], audio: { url: "a0-new" } }, cuts[1]] };
      expect(isRenderStale({ ...after, render: { url: "r", of: renderKey(proj) } })).toBe(true);
    });

    it("문장만 고쳐도 완성본이 낡는다 — 자막이 문장에서 나온다", () => {
      const after = { cuts: [{ ...cuts[0], sentence: "고친 문장" }, cuts[1]] };
      expect(isRenderStale({ ...after, render: { url: "r", of: renderKey(proj) } })).toBe(true);
    });

    it("컷을 다시 나누면 완성본이 낡는다 — cuts 라우트에 코드를 더할 필요가 없다", () => {
      expect(isRenderStale({ cuts: [], render: { url: "r", of: renderKey(proj) } })).toBe(true);
    });

    it("각인이 없거나 완성본이 없으면 낡지 않은 것으로 본다", () => {
      expect(isRenderStale({ ...proj, render: { url: "r" } })).toBe(false);
      expect(isRenderStale(proj)).toBe(false);
      expect(isRenderStale(null)).toBe(false);
    });
  });
});

describe("isReachable", () => {
  it("자료 단계는 언제나 열려 있다", () => {
    expect(isReachable("material", null)).toBe(true);
  });
  it("현재 단계까지만 열린다", () => {
    const p = { status: "script", briefing: { confirmed: true } };
    expect(isReachable("script", p)).toBe(true);
    expect(isReachable("voice", p)).toBe(false);
    expect(isReachable("images", p)).toBe(false);
  });
  it("대본 승인 직후 status가 cuts로 서야 목소리 단계가 열린다", () => {
    // 라우트가 파이프라인보다 먼저 status:cuts를 세우는 이유 — script인 채로 오면 가드가 되돌린다
    const base = { briefing: { confirmed: true } };
    expect(isReachable("voice", { ...base, status: "script" })).toBe(false);
    expect(isReachable("voice", { ...base, status: "cuts", cuts: [] })).toBe(true); // 컷이 비어 있어도 열린다
  });
  it("지난 단계는 다시 열 수 있다", () => {
    const p = { status: "voice", briefing: { confirmed: true } };
    expect(isReachable("script", p)).toBe(true);
    expect(isReachable("voice", p)).toBe(true);
    expect(isReachable("images", p)).toBe(true);
    expect(isReachable("video", p)).toBe(false);
  });
  it("영상 단계에 있으면 앞 단계가 전부 열려 있다", () => {
    const p = { briefing: { confirmed: true }, status: "images" };
    for (const k of ["material", "script", "voice", "images", "video"]) {
      expect(isReachable(k, p), k).toBe(true);
    }
    // 이미지까지만 끝났으면 이어붙일 클립이 없다 — 완성은 아직 열지 않는다
    expect(isReachable("done", p)).toBe(false);
  });
  it("클립이 끝나면 완성이 열린다 — 아니면 아무도 완성본을 만들 수 없다", () => {
    // 잠금 고리였다: ⑥완성은 status 가 done 이어야 열리는데, status 는 합성이 끝나야
    // done 이 되고, 합성은 ⑥완성 화면에서만 시작할 수 있었다. 현재 단계는 ⑤영상으로
    // 두는 것이 맞지만(완성은 사장님이 눌러야 시작된다), 열려는 있어야 한다.
    const p = { briefing: { confirmed: true }, status: "video" };
    expect(currentStepKey(p)).toBe("video");
    expect(isReachable("done", p)).toBe(true);
  });
  it("완성한 뒤에도 완성 화면은 열려 있다 — 다시 합치거나 내려받는다", () => {
    const p = { briefing: { confirmed: true }, status: "done" };
    expect(isReachable("done", p)).toBe(true);
  });
});

describe("clipKey — 속도가 바뀌면 클립이 낡는다", () => {
  const base = { image: { url: "i0" }, seconds: 6, motion: "천천히" };

  it("속도를 바꾸면 키가 달라진다", () => {
    expect(clipKey({ ...base, speed: "fast" })).not.toBe(clipKey({ ...base, speed: "slow" }));
  });

  // ★ styleKey 때와 같은 함정이다. 형식을 바꾸면 옛 각인이 전부 불일치가 되어
  //   이미 값을 치른 클립이 통째로 낡는다. 속도가 있을 때만 덧붙인다.
  it("속도가 없는 옛 컷의 키는 그대로다", () => {
    expect(clipKey(base)).toBe("i0|6|천천히");
    expect(isClipStale({ ...base, video: { url: "v", of: "i0|6|천천히" } })).toBe(false);
  });
});

describe("자막 위치와 완성본 각인", () => {
  const withCuts = (settings) => ({
    settings,
    cuts: [
      { audio: { url: "a0" }, video: { url: "v0" }, sentence: "첫 문장" },
      { audio: { url: "a1" }, video: { url: "v1" }, sentence: "둘째 문장" },
    ],
  });

  // ★★ 이 단정이 이 태스크의 전부다. 형식을 무조건 바꾸면 이미 만든 완성본이
  //    통째로 낡는다 — clipKey 가 speed 를 다루는 방식과 같은 이유다.
  it("자막 설정이 없는 옛 프로젝트의 각인은 그대로다", () => {
    const 옛것 = renderKey(withCuts(undefined));
    const 빈설정 = renderKey(withCuts({}));
    // 손으로 적은 기대값 — 이 형식이 바뀌면 옛 완성본이 전부 낡는다
    expect(옛것).toBe("a0|v0|첫 문장\na1|v1|둘째 문장");
    expect(빈설정).toBe(옛것);
  });

  it("기본값(bottom)을 명시해도 각인이 달라진다 — 그것이 고른 것이다", () => {
    // 사장님이 실제로 '아래'를 눌러 저장한 상태다. 옛것과 구별되어야
    // 그 뒤에 '위'로 바꿨을 때도 정상적으로 낡는다.
    expect(renderKey(withCuts({ subtitle_position: "bottom" }))).not.toBe(
      renderKey(withCuts(undefined))
    );
  });

  it("위치를 바꾸면 각인이 바뀐다", () => {
    const 아래 = renderKey(withCuts({ subtitle_position: "bottom" }));
    const 위 = renderKey(withCuts({ subtitle_position: "top" }));
    const 중간 = renderKey(withCuts({ subtitle_position: "middle" }));
    expect(new Set([아래, 위, 중간]).size).toBe(3);
  });

  it("바꾸면 완성본이 낡는다", () => {
    const p = withCuts({ subtitle_position: "bottom" });
    p.render = { url: "/api/renders/x.mp4", of: renderKey(p) };
    expect(isRenderStale(p)).toBe(false);
    p.settings.subtitle_position = "top";
    expect(isRenderStale(p)).toBe(true);
  });

  it("자막 위치는 클립·그림·소리를 낡게 하지 않는다", () => {
    const cut = { image: { url: "i", of: "장면" }, video: { url: "v", of: clipKey({ image: { url: "i" }, seconds: 3, motion: "m" }) }, seconds: 3, motion: "m" };
    const before = clipKey(cut);
    // 자막 위치는 컷에 없다 — clipKey 의 입력이 아니다
    expect(clipKey(cut)).toBe(before);
  });
});
