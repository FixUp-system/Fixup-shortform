import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  STEPS, stepsFor, currentStepKey, isReachable, areCutsStale, stepFromPathname, stepHref,
  clipKey, renderKey, isAudioStale, isImageStale, isClipStale, isRenderStale, toneKey, imageContextKey,
  isSubtitlePositionOnlyStale, isSubtitleOnlyStale, subtitleHead, renderKeyBody,
} from "../lib/steps.js";
import { DEFAULT_SUBTITLE } from "../lib/subtitles.js";

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

    describe("톤 각인", () => {
      it("각인이 없던 그림은 안 낡는다", () => {
        // 옛 프로젝트가 통째로 낡으면 재구매가 제시된다 — style_of 때 겪은 함정이다
        const cut = { shows: "가", image: { url: "u", of: "가" } };
        expect(isImageStale(cut, {})).toBe(false);
      });

      it("톤이 바뀌면 낡는다", () => {
        const cut = { shows: "가", tone: "새 톤", image: { url: "u", of: "가", tone_of: "옛 톤" } };
        expect(isImageStale(cut, {})).toBe(true);
      });

      it("톤이 그대로면 안 낡는다", () => {
        const cut = { shows: "가", tone: "같은 톤", image: { url: "u", of: "가", tone_of: "같은 톤\n" } };
        expect(isImageStale(cut, {})).toBe(false);
      });

      it("걸러지는 값은 각인에 안 들어간다", () => {
        // 쓰이지 않는 값으로 낡음을 판정하면 그림이 안 바뀌는데 낡았다고 나온다
        expect(toneKey({ tone: "천천히 줌 인", transition: "앞 컷에서" })).toBe("");
      });

      it("톤과 전환을 한 줄로 굳힌다", () => {
        expect(toneKey({ tone: "질감", transition: "구도" })).toBe("질감\n구도");
        expect(toneKey({ tone: "질감" })).toBe("질감\n");
      });
    });

    // 무대·인물 외형·제품 외형은 **이미지 프롬프트에 이미 실린다**(buildImagePrompt).
    // 그런데 그림 각인은 화면 설명·톤·화풍만 봤다 — 클립 각인(clipKey)이 같은 셋을 보게 된
    // 2026-08-14 이후로는 **무대를 고치면 클립만 낡고 그림은 조용한** 상태였다.
    // 그러면 사장님은 옛 무대 그림을 첫 프레임으로 두고 새 무대 지시로 클립을 산다(유료).
    describe("무대·인물 외형·제품 외형 각인 — 이미지 프롬프트가 싣는 것과 같다", () => {
      const project = (over = {}) => ({
        cast: [{ who: "여성", look: "긴 머리", cuts: [0] }],
        briefing: { focus: { mode: "물건", subject: "키체인", look: "리본" } },
        ...over,
      });
      const cut = (over = {}) => ({ idx: 0, shows: "가", environment: "실내 스튜디오", ...over });

      it("이미지 프롬프트와 같은 순서로 담는다 — 무대→인물→제품", () => {
        expect(imageContextKey(cut(), project())).toBe("stage:실내 스튜디오|cast:여성: 긴 머리|subject:키체인:리본");
      });

      it("톤·화풍은 여기 안 담는다 — tone_of·style_of 가 이미 본다(값이 두 벌이면 갈린다)", () => {
        expect(imageContextKey(cut({ tone: "따뜻" }), project({ settings: { style: { preset: "anime" } } })))
          .toBe("stage:실내 스튜디오|cast:여성: 긴 머리|subject:키체인:리본");
      });

      it("무대를 고치면 그림이 낡는다", () => {
        const c = cut({ image: { url: "u", of: "가", context_of: "stage:해안 도로|cast:여성: 긴 머리|subject:키체인:리본" } });
        expect(isImageStale(c, project())).toBe(true);
      });

      it("그대로면 안 낡는다", () => {
        const c = cut({ image: { url: "u", of: "가", context_of: imageContextKey(cut(), project()) } });
        expect(isImageStale(c, project())).toBe(false);
      });

      it("제품 외형만 다듬어도 낡는다 — 그 문장이 프롬프트에 실린다", () => {
        const c = cut({ image: { url: "u", of: "가", context_of: imageContextKey(cut(), project()) } });
        const edited = project({ briefing: { focus: { mode: "물건", subject: "키체인", look: "리본과 금속 키링" } } });
        expect(isImageStale(c, edited)).toBe(true);
      });

      it("다른 컷의 인물이 바뀌어도 이 컷은 안 낡는다", () => {
        const c = cut({ image: { url: "u", of: "가", context_of: imageContextKey(cut(), project()) } });
        const other = project({
          cast: [{ who: "여성", look: "긴 머리", cuts: [0] }, { who: "남성", look: "새 외형", cuts: [1] }],
        });
        expect(isImageStale(c, other)).toBe(false);
      });

      // ★ 이 축은 각인이 없으면 **낡았다**로 본다 — style_of·tone_of 와 극성이 반대다.
      //   근거는 실측이다(2026-08-15): 저장된 프로젝트 44편에 이미 산 그림이 10장뿐이고
      //   그 10장이 전부 이 맥락을 갖고 있다($0.80). 각인 없음을 "안 낡음"으로 두면
      //   바로 그 10장에서 위 결함(클립만 낡는다)이 그대로 살아 있다.
      it("맥락이 있는데 각인이 없는 옛 그림은 낡는다", () => {
        const c = cut({ image: { url: "u", of: "가" } });
        expect(isImageStale(c, project())).toBe(true);
      });

      // 값이 하나도 없는 컷까지 낡게 만들면 옛 프로젝트가 통째로 재구매가 된다.
      it("맥락이 하나도 없으면 각인이 없어도 안 낡는다", () => {
        const c = { idx: 0, shows: "가", image: { url: "u", of: "가" } };
        expect(imageContextKey(c, { settings: { style: { preset: "photo" } } })).toBe("");
        expect(isImageStale(c, { settings: { style: { preset: "photo" } } })).toBe(false);
      });

      // ⚠️ 화면비(orientOf)는 이 각인에 안 넣는다. 이미지 프롬프트가 그것을 싣는 것은 맞지만
      //    orientOf 는 **늘 값이 있어**("horizontal 16:9" 기본값) "값이 있을 때만" 규칙을
      //    못 지킨다 — 넣어서 돌려 보니 기존 계약 6건이 깨졌다(2026-08-15 실측). 화면비가
      //    어느 각인에도 없는 것은 이 브랜치보다 앞선 결함이고(최종 리뷰 Minor 5) 클립·완성
      //    각인까지 함께 봐야 한다.
      it("화면비는 이 각인에 안 담는다", () => {
        const p = project({ settings: { aspect_ratio: "9:16" } });
        expect(imageContextKey(cut(), p)).toBe(imageContextKey(cut(), project({ settings: { aspect_ratio: "16:9" } })));
      });

      // cuts.filter(isImageStale) 처럼 함수를 그대로 넘기면 배열 번호가 project 자리에 온다.
      it("프로젝트를 안 주면 이 축을 건너뛴다 — 덜 알리는 쪽이 안전하다", () => {
        const c = cut({ image: { url: "u", of: "가" } });
        expect(imageContextKey(cut(), undefined)).toBe("");
        expect(isImageStale(c)).toBe(false);
        expect(isImageStale(c, 3)).toBe(false);
      });

      // 그림이 아직 없는 컷을 낡음으로 세면 ④화면이 만들지도 않은 그림을 "낡았다"고 말한다.
      it("그림이 없으면 판정하지 않는다", () => {
        expect(isImageStale(cut(), project())).toBe(false);
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

// 대사·목소리는 컷에 저장된 필드가 아니라 **프로젝트에서 파생**된다. 그래서 각인도
// project 를 함께 받아 그 자리에서 파생시킨다 — 저장할 때와 잴 때가 다른 출처면
// 영원히 불일치가 되어 살아 있는 클립을 매번 다시 산다.
describe("clipKey — 말하는 컷은 대사·목소리에서 파생된다", () => {
  const cut = { idx: 0, sentence: "안녕하세요", image: { url: "u" }, seconds: 5, motion: "천천히" };
  const speaking = {
    settings: { i2v_model: "seedance-2.0" },
    cuts: [{ idx: 0, sentence: "안녕하세요" }],
    cast: [{ id: "c1", who: "20대 남성", voice: "중저음", cuts: [0] }],
  };
  const withVoice = (voice) => ({ ...speaking, cast: [{ ...speaking.cast[0], voice }] });

  it("옛 컷의 각인은 한 글자도 안 바뀐다", () => {
    const old = { image: { url: "u" }, seconds: 5, motion: "천천히" };
    expect(clipKey(old)).toBe("u|5|천천히");
    expect(clipKey({ ...old, speed: "fast" })).toBe("u|5|천천히|fast");
    // 말하지 않는 프로젝트를 넘겨도 그대로다
    expect(clipKey(cut, { ...speaking, settings: { i2v_model: "kling-v3" } })).toBe("u|5|천천히");
  });

  it("project 를 안 넘기면 예전과 같다", () => {
    expect(clipKey(cut)).toBe("u|5|천천히");
  });

  it("대사·목소리가 바뀌면 클립이 낡는다", () => {
    const a = clipKey(cut, speaking);
    const b = clipKey(cut, withVoice("높은 톤"));
    expect(a).not.toBe(b);
    expect(a).not.toBe(clipKey(cut));
    expect(clipKey({ ...cut, sentence: "다른 말" }, { ...speaking, cuts: [{ idx: 0, sentence: "다른 말" }] }))
      .not.toBe(a);
  });

  // ★★ 저장(clipKey)과 판정(isClipStale)이 같은 출처에서 나와야 한다. 안 그러면
  //    저장된 컷에 대사·목소리가 없어 매번 낡음으로 읽히고, 클립을 통째로 다시 산다.
  it("저장된 컷에 대사 필드가 없어도 안 낡는다 — 양쪽이 같은 함수에서 파생된다", () => {
    const saved = { ...cut, video: { url: "v", of: clipKey(cut, speaking) } };
    expect(isClipStale(saved, speaking)).toBe(false);
    expect(isClipStale(saved, withVoice("높은 톤"))).toBe(true);
  });
});

describe("clipKey — 해상도", () => {
  const cut = { image: { url: "u" }, seconds: 5, motion: "천천히" };

  it("해상도를 안 받는 모델에서는 각인이 안 바뀐다", () => {
    // 이 작업의 하드 제약 — 붙이는 순간 이미 값을 치른 클립이 통째로 낡는다(~$9/편)
    const kling = { settings: { i2v_model: "kling-v3" } };
    const before = clipKey(cut, { settings: { i2v_model: "kling-v3" } });
    expect(clipKey(cut, kling)).toBe(before);
    expect(clipKey(cut, kling)).not.toContain("720p");
  });

  it("project 를 안 주면 해상도를 안 붙인다", () => {
    // cuts.some(clipKey) 처럼 포인트프리로 넘기면 배열 번호가 이 자리에 온다.
    // 덜 알리는 쪽이 안전하다(isImageStale 의 style_of 와 같은 방침).
    expect(clipKey(cut, 1)).not.toContain("720p");
    expect(clipKey(cut)).not.toContain("720p");
  });

  // ★★ 하드 제약을 무는 자리. main 에 이미 있는 Seedance 프로젝트들은 settings.resolution 이
  //    없는 채로 클립을 샀다(선택 UI 가 이 브랜치 것이다). 기본값을 각인에 붙이면 그 클립들이
  //    통째로 낡아 픽셀이 같은 mp4 를 다시 사게 된다(~$9/편, 원장 성공 5건 $6.65).
  it("기본 화질이면 각인에 자리가 안 붙는다 — 옛 Seedance 클립이 안 낡는다", () => {
    const 미선택 = { settings: { i2v_model: "seedance-2.0" } };
    expect(clipKey(cut, 미선택)).toBe(clipKey(cut, { settings: {} }));  // 옛 각인과 글자 그대로 같다
    expect(clipKey(cut, 미선택)).not.toContain("720p");
  });

  it("Seedance 는 해상도가 각인에 들어간다", () => {
    const p = { settings: { i2v_model: "seedance-2.0", resolution: "1080p" } };
    expect(clipKey(cut, p)).toContain("1080p");
  });

  it("해상도를 바꾸면 각인이 달라진다 — 그래야 클립이 낡는다", () => {
    const a = { settings: { i2v_model: "seedance-2.0", resolution: "720p" } };
    const b = { settings: { i2v_model: "seedance-2.0", resolution: "1080p" } };
    expect(clipKey(cut, a)).not.toBe(clipKey(cut, b));
  });

  // ★ 각인은 저장값을 **날것으로** 읽으면 안 된다. resolutionForProject 가 목록 밖 값을
  //   기본값으로 정규화하는데, 그 정규화를 건너뛰면 "2160p" 같은 값이 각인에 그대로 붙어
  //   이미 값을 치른 클립이 통째로 낡는다(~$9/편). 지금은 두 입구가 isResolutionFor 로
  //   막아 도달 불가지만, 그 검증이 느슨해지는 날 이 테스트가 잡는다.
  it("목록 밖 해상도가 저장돼 있어도 기본값으로 정규화된다 — 각인에 안 샌다", () => {
    const 이상값 = { settings: { i2v_model: "seedance-2.0", resolution: "2160p" } };
    const 미선택 = { settings: { i2v_model: "seedance-2.0" } };
    expect(clipKey(cut, 이상값)).not.toContain("2160p");
    expect(clipKey(cut, 이상값)).toBe(clipKey(cut, 미선택));
  });

  it("해상도를 안 고른 Seedance 프로젝트는 720p 로 각인된다", () => {
    // resolutionForProject 가 기본값을 주므로 저장 여부와 무관하게 같은 값이 나온다.
    // 사장님이 720p 를 명시로 골라도 각인이 안 바뀐다.
    const 미선택 = { settings: { i2v_model: "seedance-2.0" } };
    const 명시 = { settings: { i2v_model: "seedance-2.0", resolution: "720p" } };
    expect(clipKey(cut, 미선택)).toBe(clipKey(cut, 명시));
  });
});

describe("clipKey — 프롬프트에 실리는 것은 각인에도 있다", () => {
  const base = { settings: { aspect_ratio: "9:16" }, briefing: {}, cast: [] };
  const cut = { idx: 0, image: { url: "u" }, seconds: 5, motion: "달린다" };

  it("무대를 바꾸면 클립이 낡는다", () => {
    const a = clipKey({ ...cut, environment: "해변" }, base);
    const b = clipKey({ ...cut, environment: "도심" }, base);
    expect(a).not.toBe(b);
  });

  it("톤을 바꾸면 낡는다", () => {
    expect(clipKey({ ...cut, tone: "따뜻" }, base)).not.toBe(clipKey({ ...cut, tone: "차갑" }, base));
  });

  it("이 컷의 인물이 바뀌면 낡는다", () => {
    const p1 = { ...base, cast: [{ who: "A", look: "긴 머리", cuts: [0] }] };
    const p2 = { ...base, cast: [{ who: "A", look: "짧은 머리", cuts: [0] }] };
    expect(clipKey(cut, p1)).not.toBe(clipKey(cut, p2));
  });

  it("제품 앵커가 바뀌면 낡는다", () => {
    const p1 = { ...base, briefing: { topic: "커피" } };
    const p2 = { ...base, briefing: { topic: "차" } };
    expect(clipKey(cut, p1)).not.toBe(clipKey(cut, p2));
  });

  // ★ 관계없는 값은 안 건드린다 — 다른 컷의 인물이 바뀌었다고 이 컷이 낡으면 안 된다
  it("다른 컷의 인물이 바뀌어도 이 컷은 안 낡는다", () => {
    const p1 = { ...base, cast: [{ who: "B", look: "x", cuts: [1] }] };
    const p2 = { ...base, cast: [{ who: "B", look: "y", cuts: [1] }] };
    expect(clipKey(cut, p1)).toBe(clipKey(cut, p2));
  });

  // ⚠️ project 를 안 주면 **프롬프트는 절을 하나도 안 붙인다**(clipContextClause 가
  //    `if (!project) return ""` 이다). 각인이 그보다 더 말하면 파일이 스스로 적어 둔
  //    불변("안 주면 덜 알린다 — 낡음을 더 알리면 유료 호출을 부른다")이 깨진다:
  //    저장된 각인은 무대·인물·제품·톤을 담고 있는데 계산값은 무대·톤만 담아
  //    **거짓 낡음**이 되고, 그 자리에 컷당 8크레딧짜리 [다시 만들기]가 열린다.
  describe("project 를 안 주면 각인도 프롬프트와 똑같이 침묵한다", () => {
    const rich = { idx: 0, image: { url: "u" }, seconds: 5, motion: "달린다", environment: "해변", tone: "따뜻" };

    // 손으로 적은 기대값이다 — 형식이 바뀌면 옛 각인이 전부 불일치가 된다
    it("무대도 톤도 안 붙는다", () => {
      expect(clipKey(rich)).toBe("u|5|달린다");
      expect(clipKey(rich, 3)).toBe("u|5|달린다");
      expect(clipKey(rich, null)).toBe("u|5|달린다");
    });

    it("project 를 주면 넷 다 붙는다 — 침묵은 project 가 없을 때뿐이다", () => {
      const p = { ...base, cast: [{ who: "A", look: "긴 머리", cuts: [0] }], briefing: { topic: "커피" } };
      expect(clipKey(rich, p)).toBe("u|5|달린다|stage:해변|cast:A: 긴 머리|subject:커피|tone:따뜻");
    });
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

  it("기본값을 명시해도 각인은 옛것과 같다 — 아래는 원래 모습이라 적을 것이 없다", () => {
    // 각인은 "무엇을 눌렀는가"가 아니라 "완성본이 어떻게 보이는가"의 지문이다.
    // 이미 켜져 있는 '아래' 칩을 한 번 눌러 명시 저장되는 것만으로 완성본이 낡으면
    // 픽셀이 같은 mp4 를 다시 만들게 시킨다(거짓 낡음).
    // 구별해서 얻는 것도 없다 — '위'로 바꾸면 "top\n" 이 붙어 어차피 달라진다.
    expect(renderKey(withCuts({ subtitle_position: "bottom" }))).toBe(
      renderKey(withCuts(undefined))
    );
  });

  it("완성본이 있는 프로젝트에서 기본값을 명시 저장해도 낡지 않는다", () => {
    const p = withCuts(undefined);
    p.render = { url: "/api/renders/x.mp4", of: renderKey(p) };
    p.settings = { subtitle_position: "bottom" };
    expect(isRenderStale(p)).toBe(false);
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

describe("isSubtitlePositionOnlyStale — 낡음의 원인을 갈라 말한다", () => {
  // 컷·그림·소리는 전부 각인과 맞는 상태로 둔다(그쪽 낡음이 섞이면 판정이 안 갈린다)
  const fresh = () => {
    const cuts = [
      { image: { url: "i0", of: "장면0" }, shows: "장면0", seconds: 3, motion: "m", audio: { url: "a0" }, sentence: "첫 문장" },
      { image: { url: "i1", of: "장면1" }, shows: "장면1", seconds: 3, motion: "m", audio: { url: "a1" }, sentence: "둘째 문장" },
    ];
    for (const c of cuts) c.video = { url: `v${cuts.indexOf(c)}`, of: clipKey(c) };
    return { cuts, settings: {} };
  };

  it("위치만 바뀌었으면 참이다", () => {
    const p = fresh();
    p.render = { url: "/api/renders/x.mp4", of: renderKey(p) };
    p.settings.subtitle_position = "top";
    expect(isRenderStale(p)).toBe(true);
    expect(isSubtitlePositionOnlyStale(p)).toBe(true);
  });

  it("위치를 옛것으로 되돌린 경우처럼 안 낡았으면 거짓이다", () => {
    const p = fresh();
    p.render = { url: "/api/renders/x.mp4", of: renderKey(p) };
    expect(isSubtitlePositionOnlyStale(p)).toBe(false);
  });

  it("문장까지 고쳤으면 거짓이다 — 그쪽이 더 큰 사실이다", () => {
    const p = fresh();
    p.render = { url: "/api/renders/x.mp4", of: renderKey(p) };
    p.settings.subtitle_position = "top";
    p.cuts[0].sentence = "고친 문장";
    expect(isSubtitlePositionOnlyStale(p)).toBe(false);
  });

  it("그림·클립이 함께 낡았으면 거짓이다", () => {
    const 그림 = fresh();
    그림.render = { url: "/api/renders/x.mp4", of: renderKey(그림) };
    그림.settings.subtitle_position = "middle";
    그림.cuts[0].shows = "다른 장면";
    expect(isSubtitlePositionOnlyStale(그림)).toBe(false);

    const 클립 = fresh();
    클립.render = { url: "/api/renders/x.mp4", of: renderKey(클립) };
    클립.settings.subtitle_position = "middle";
    클립.cuts[0].video.of = "옛 클립 각인";
    expect(isSubtitlePositionOnlyStale(클립)).toBe(false);
  });

  it("완성본이 없거나 각인이 없으면 거짓이다", () => {
    expect(isSubtitlePositionOnlyStale(fresh())).toBe(false);
    expect(isSubtitlePositionOnlyStale(null)).toBe(false);
  });
});

describe("renderKey — 자막 설정", () => {
  const base = { cuts: [{ audio: { url: "a" }, video: { url: "v" }, sentence: "가" }] };

  // ★★ 기본 설정이면 머리를 안 붙인다 — 붙이면 이미 만든 완성본이 전부 낡는다
  it("기본 설정이면 각인이 지금과 글자 그대로 같다", () => {
    expect(renderKey(base)).toBe("a|v|가");
    expect(renderKey({ ...base, settings: { subtitle: { ...DEFAULT_SUBTITLE } } })).toBe("a|v|가");
  });

  it("옛 각인(위치 낱말 머리)도 계속 읽힌다", () => {
    const old = { ...base, settings: { subtitle_position: "top" } };
    expect(renderKey(old)).toBe("top\na|v|가");
  });

  it("설정을 바꾸면 각인이 달라진다", () => {
    const k = renderKey({ ...base, settings: { subtitle: { ...DEFAULT_SUBTITLE, color: "#FF0000" } } });
    expect(k).not.toBe("a|v|가");
    expect(k).toContain("subtitle:");
    expect(k.endsWith("a|v|가")).toBe(true);   // 몸통은 그대로
  });
});

describe("isSubtitleOnlyStale — 자막만 바뀌었는가", () => {
  const project = (settings, of) => ({
    settings,
    // 클립·그림은 각인과 맞는 상태로 둔다 — 그쪽이 낡으면 판정이 안 갈린다.
    // video.of 는 clipKey(이 컷)와 **글자 그대로** 같아야 한다(image.url|seconds|motion).
    cuts: [{ audio: { url: "a" }, video: { url: "v", of: "img|3|천천히" }, sentence: "가",
             image: { url: "img" }, seconds: 3, motion: "천천히" }],
    render: { of },
  });

  it("자막 설정만 바뀌었으면 참이다 — 클립을 다시 사지 않는다", () => {
    const p = project({ subtitle: { ...DEFAULT_SUBTITLE, size: 1.4 } }, "a|v|가");
    expect(isRenderStale(p)).toBe(true);
    expect(isSubtitleOnlyStale(p)).toBe(true);
  });

  it("문장이 바뀌었으면 거짓이다 — 더 큰 사실이 있다", () => {
    const p = project({ subtitle: { ...DEFAULT_SUBTITLE } }, "a|v|옛문장");
    expect(isSubtitleOnlyStale(p)).toBe(false);
  });

  it("낡지 않았으면 거짓이다", () => {
    const p = project({ subtitle: { ...DEFAULT_SUBTITLE } }, "a|v|가");
    expect(isSubtitleOnlyStale(p)).toBe(false);
  });

  // ★ 옛 이름은 별칭으로 남는다 — 호출처(app/create/[id]/done/page.js)를 한 번에 못 고친다
  it("옛 이름도 같은 함수를 가리킨다", () => {
    expect(isSubtitlePositionOnlyStale).toBe(isSubtitleOnlyStale);
  });
});

describe("stepsFor — 말하는 프로젝트에는 목소리 단계가 없다", () => {
  const speaking = {
    settings: { i2v_model: "seedance-2.0" },
    cuts: [{ idx: 0, sentence: "말하는 컷입니다." }],
    cast: [{ who: "20대 남성", cuts: [0] }],
  };
  const tts = { settings: { i2v_model: "kling-v3" }, cuts: [{ idx: 0, sentence: "컷." }], cast: [] };

  it("Seedance 프로젝트에서는 voice 가 빠진다", () => {
    expect(stepsFor(speaking).map((s) => s.key)).toEqual(
      ["material", "script", "images", "video", "done"]
    );
  });

  it("Kling 프로젝트는 지금과 같다", () => {
    expect(stepsFor(tts).map((s) => s.key)).toEqual(
      ["material", "script", "voice", "images", "video", "done"]
    );
  });

  it("프로젝트가 없으면 기본 목록이다", () => {
    expect(stepsFor(null).map((s) => s.key)).toEqual(STEPS.map((s) => s.key));
  });

  // ★ 화면이 여는 문과 가드가 닫는 문이 갈리면 안 된다(2026-08-13 에 겪은 결함).
  //   숨긴 단계로 보내 놓고 가드가 되돌리면 사장님은 버튼이 고장난 것으로 본다.
  it("말하는 프로젝트는 컷이 끝나면 목소리가 아니라 이미지로 간다", () => {
    expect(currentStepKey({ ...speaking, briefing: { confirmed: true }, status: "cuts" }))
      .toBe("images");
  });

  it("TTS 프로젝트는 지금처럼 목소리로 간다", () => {
    expect(currentStepKey({ ...tts, briefing: { confirmed: true }, status: "cuts" }))
      .toBe("voice");
  });

  // ★ 2026-08-14 리뷰에서 잡힌 어긋남 — isReachable 이 raw STEPS 로 순위를 매기면
  //   목록에 없는 "voice" 도 index -1 이 나와 "-1 <= 아무 index" 가 참이 되어 새어 나온다.
  //   목록에 없는 단계는 애초에 열릴 수 없다고 먼저 끊는다.
  it("말하는 프로젝트에서는 voice 자체가 열려 있지 않다", () => {
    const p = { ...speaking, briefing: { confirmed: true }, status: "cuts" };
    expect(isReachable("voice", p)).toBe(false);
    expect(isReachable("images", p)).toBe(true);
  });
});

// ★★ 2026-08-14 리뷰에서 잡힌 결함 — layout.js의 import 를 STEPS→stepsFor 로 바꾸면서
//   본문의 `STEPS.find(...)`를 stepsFor(project).find(...) 로 못 고쳐 ReferenceError 가
//   났다(가드의 리다이렉트 갈래가 돌 때마다, 즉 모든 프로젝트에서 터진다). 이 저장소에는
//   "use client" 화면을 렌더하는 테스트 도구가 없다(react-testing-library 미설치,
//   tests/staleness-ui.test.js 와 같은 이유) — 그래서 소스를 직접 훑어 어긋남을 잡는다.
describe("app/create/[id]/layout.js — 가드가 STEPS 가 아니라 stepsFor 를 쓰는가(소스 스캔)", () => {
  const path = "app/create/[id]/layout.js";
  const src = readFileSync(path, "utf8");
  const importLine = src.split("\n").find((l) => l.includes('from "../../../lib/steps"'));

  it("STEPS 를 더는 import 하지 않는다 — stepsFor 로 바꿨다", () => {
    expect(importLine).toBeTruthy();
    expect(importLine).toContain("stepsFor");
    expect(importLine).not.toMatch(/\bSTEPS\b/);
  });

  it("가드의 목표 단계 계산이 stepsFor(project) 를 쓴다 — import 를 바꿔 놓고 본문을 놓치면 안 된다", () => {
    expect(src).toContain("stepsFor(project).find");
    // import 줄을 뺀 본문에 bare STEPS 식별자가 남아 있으면 스코프 밖 참조라 ReferenceError 다
    const body = src.split("\n").filter((l) => l !== importLine).join("\n");
    expect(body).not.toMatch(/\bSTEPS\b/);
  });
});

// 자막 각인에 언어가 들어가야 언어를 바꿨을 때 완성본이 낡는다 — 안 들어가면 사장님이
// 언어를 바꿔도 아무 일이 안 일어난다(다시 굽기 버튼조차 안 뜬다).
describe("자막 각인에 언어가 들어간다", () => {
  it("언어를 바꾸면 완성본이 낡는다", () => {
    const a = { settings: { subtitle_lang: "ko" } };
    const b = { settings: { subtitle_lang: "ja" } };
    expect(subtitleHead(a)).not.toBe(subtitleHead(b));
  });

  // ★ 회귀 0 — 한국어·미설정은 각인이 오늘과 글자 그대로 같아야 한다.
  //   붙이면 이미 만든 완성본이 전부 낡아 픽셀이 같은 mp4 를 다시 굽는다.
  it("한국어·미설정은 각인이 오늘 그대로다", () => {
    const cuts = [{ sentence: "가", audio: { url: "a" }, video: { url: "v" } }];
    expect(subtitleHead({ settings: {} })).toBe(null);
    expect(subtitleHead({ settings: { subtitle_lang: "ko" } })).toBe(null);
    expect(renderKey({ settings: { subtitle_lang: "ko" }, cuts })).toBe(renderKey({ cuts }));
  });

  // 자막 설정과 언어가 함께 있어도 머리는 한 줄이고, 몸통은 그대로 떨어져 나와야 한다
  it("언어 머리도 몸통에서 떼어진다", () => {
    const cuts = [{ sentence: "가", audio: { url: "a" }, video: { url: "v" } }];
    const body = renderKey({ cuts });
    expect(renderKeyBody(renderKey({ settings: { subtitle_lang: "ja" }, cuts }))).toBe(body);
    expect(
      renderKeyBody(renderKey({ settings: { subtitle_lang: "ja", subtitle_position: "top" }, cuts }))
    ).toBe(body);
    expect(
      renderKeyBody(renderKey({ settings: { subtitle_lang: "zh", subtitle: { ...DEFAULT_SUBTITLE, color: "#FF0000" } }, cuts }))
    ).toBe(body);
  });

  // 언어만 바꾼 것은 자막만 다시 구우면 된다(로컬 ffmpeg, 값 0원). 컷이 낡았다고 하면
  // 사장님이 클립을 다시 사야 하는 줄 안다.
  it("언어만 바꾸면 자막만 낡은 것으로 본다", () => {
    const cuts = [{ sentence: "가", audio: { url: "a" }, video: { url: "v" } }];
    const project = {
      settings: { subtitle_lang: "ja" },
      cuts,
      render: { of: renderKey({ cuts }) },
    };
    expect(isRenderStale(project)).toBe(true);
    expect(isSubtitleOnlyStale(project)).toBe(true);
  });
});
