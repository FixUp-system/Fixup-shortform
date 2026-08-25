import { createProject } from "../../../lib/projects.js";
import { isAspect, DEFAULT_ASPECT_ID } from "../../../lib/aspects.js";
import { ownedPhotoKeys } from "../../../lib/refs-io.js";
import { withUser } from "../../../lib/auth/require-user.js";
import { MAX_PHOTOS } from "../../../lib/photos.js";
import { MAX_MATERIAL_TEXT } from "../../../lib/material.js";
import { DEFAULT_I2V_MODEL, isResolutionFor, secondsForModel } from "../../../lib/clip-limits.js";
import { normalizeAdOptions } from "../../../lib/ad/options.js";
import { normalizeReelConcept } from "../../../lib/reel/concepts.js";
import { isSubtitleLang, DEFAULT_SPEECH_LANG } from "../../../lib/subtitle-langs.js";

// reel 프로젝트를 만든다 — kind:"reel" 로, 옛 단계별 흐름(isStepDoc)과 격리된다
// (lib/projects.js 의 KINDS, 2026-08-21).
export const POST = withUser(async (req, _ctx, user) => {
  const body = await req.json().catch(() => null);
  if (typeof body?.material?.text !== "string" || !body.material.text.trim()) {
    return Response.json({ error: "무엇을 만들지 적어 주세요" }, { status: 400 });
  }

  const aspect = body?.settings?.aspect_ratio ?? DEFAULT_ASPECT_ID;
  if (!isAspect(aspect)) {
    return Response.json({ error: "그 화면 비율은 몰라요" }, { status: 400 });
  }

  // ★★ Task 11 리뷰 I6 — 길이를 안 받으면 lib/pricing.js 의 videoPrice 가
  //   `table[NaN]` → undefined → **조용히 30초 칸**으로 떨어진다(60초 영상을 30초 값에
  //   판다). 옛 단계별 흐름(app/api/projects/route.js)은 안 고르면 null 을 허용하지만
  //   그건 원고 길이로 추정하는 대체 경로가 있어서다 — reel 에는 그 대체가 없으므로
  //   여기서는 **명시로 요구한다**(조용히 접는 방향이 늘 비싼 쪽이라는 이 저장소의 규칙).
  // ★★ 2026-08-25 — 길이는 **모델이 정한다**(사장님 지시: "각 모델이 제공하는 영상
  //   길이만큼만. 2.0 은 15초가 한계이니까 15초 이내로"). 그전에는 TARGET_CHOICES
  //   (15·30·45·60)를 모델과 무관하게 받아서, 한 번에 15초가 최대인 모델에 60초가
  //   들어올 수 있었다.
  // ★ 화면과 **같은 함수**를 본다(secondsForModel). 한쪽만 좁히면 화면 밖에서 뚫린다 —
  //   이 저장소가 "화면은 통과시키는데 서버가 400" 을 여러 번 겪은 그 자리의 반대편이다.
  // ★ 모델은 서버가 박는다(DEFAULT_I2V_MODEL) — 그래서 여기서도 그 값으로 잰다.
  const target = body?.settings?.target_seconds;
  if (!secondsForModel(DEFAULT_I2V_MODEL).includes(target)) {
    return Response.json({ error: "영상 길이를 골라 주세요" }, { status: 400 });
  }

  // ★★ Task 12b(Ruling 14) — 화질(해상도)도 명시로 요구한다. 안 받으면
  //   resolutionForProject(lib/clip-limits.js)가 저장된 값이 없어 **조용히 720p** 로
  //   떨어진다 — 480p 15초=40크레딧 vs 720p 15초=80크레딧, 2배 차이다. 조용히 떨어뜨리면
  //   사장님이 고른 것과 다른(더 비싼) 값에 청구되는 길을 만든다(target_seconds 와 같은
  //   판단 — 위 I6 주석 참고). 모델은 서버가 박으므로(DEFAULT_I2V_MODEL) 그 값으로 이
  //   프로젝트가 열 수 있는 해상도 목록을 얻는다 — isResolutionFor(lib/clip-limits.js) 는
  //   `resolutionsForProject`(project.settings.i2v_model 을 읽는다)를 그대로 타므로,
  //   실제 project 객체가 아직 없어도 그 모양만 흉내 내면 같은 판정을 쓸 수 있다.
  //   ★ 여기는 reel 전용 표(videoPrice·I2V_MODELS·isResolutionFor)를 쓴다 — 광고 쪽의
  //   짝(모델별 해상도 판정 함수·그 기본값)을 쓰면 화면이 말하는 값과 실제 청구
  //   (requireVideoCharge 가 보는 VIDEO_PRICE)가 갈린다(app/api/reel/[id]/clips/route.js
  //   가 그 표를 본다).
  const resolution = body?.settings?.resolution;
  if (!isResolutionFor(resolution, { settings: { i2v_model: DEFAULT_I2V_MODEL } })) {
    return Response.json({ error: "화질을 골라 주세요" }, { status: 400 });
  }

  // ★★ generateScenario(lib/ad/scenario.js) → buildScenarioMessages 는 settings.format·
  //   mood·narration_lang·style 을 **필수로 읽는다**(없으면 `need()` 가 던진다). film 의
  //   창작 라우트도 같은 이유로 이 함수를 쓴다 — 두 벌을 만들지 않고 그대로 빌린다.
  //   모르는 값은 던지고, 없는 값은 기본값으로 채운다(정의는 lib/ad/options.js 하나).
  let options;
  try {
    options = normalizeAdOptions(body?.settings);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }

  const photos = Array.isArray(body.material.photos) ? body.material.photos : [];
  if (photos.length > MAX_PHOTOS) {
    return Response.json({ error: `사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요` }, { status: 400 });
  }
  if (!(await ownedPhotoKeys(photos, user.id))) {
    return Response.json({ error: "본인이 올린 사진만 쓸 수 있어요" }, { status: 400 });
  }

  const project = await createProject({
    ownerId: user.id,
    kind: "reel",
    material: { text: body.material.text.slice(0, MAX_MATERIAL_TEXT), photos },
    settings: {
      ...options,
      // ★★ 컨셉 — reel 은 **광고 포맷이 아니라 큰 범주**를 고른다(2026-08-25 사장님 지시,
      //   lib/reel/concepts.js). options.format 은 normalizeAdOptions 가 채워 넣은 광고
      //   기본값이라 여기 그대로 남지만, reel 의 시나리오 라우트는 그것을 **안 읽는다**
      //   (conceptLine 을 넘기면 조회 자체를 건너뛴다). 지우지 않는 이유는 광고 옵션
      //   한 벌을 그대로 저장하는 모양을 깨지 않으려는 것뿐이다.
      // ★ 모르는 값은 던지지 않고 [알아서]로 떨어진다 — 컨셉은 값을 가르는 축이 아니라서
      //   (길이·화질과 다르다) 조용히 기본값이 되어도 돈이 새지 않는다.
      concept: normalizeReelConcept(body?.settings?.concept),
      aspect_ratio: aspect,
      target_seconds: target,
      // ★ Task 12b — 위에서 검증한 값을 그대로 저장한다. resolutionForProject·videoPrice·
      //   requireVideoCharge 가 전부 이 필드를 읽는다(charges.js 의 chargeVideo 참고).
      resolution,
      // ★ buildScenarioMessages 는 `settings.seconds` 를 읽는다(광고 옵션 체계의 이름이라
      //   reel 의 target_seconds 와 다르다) — 별칭을 둔다. target_seconds 는 정가
      //   (videoPrice)·청구(requireVideoCharge)가 읽고, seconds 는 시나리오 생성이 읽는다.
      //   하나를 빠뜨리면 값이 틀리거나(정가) 시나리오 생성이 죽는다(포맷 문구가 없다).
      seconds: target,
      // ★★ 이 모델로 고정한다 — reel 은 "클립이 직접 말한다"(speaks:true) 위에 서 있다.
      //   여기서 안 박으면 modelIdForProject 가 없는 값을 LEGACY_I2V_MODEL(kling-v3,
      //   speaks:false) 로 떨어뜨려 대사가 통째로 사라진다(lib/clip-limits.js).
      i2v_model: DEFAULT_I2V_MODEL,
      // ★★ 음성 언어 — **칩 하나가 둘 다 정한다**(2026-08-25 사장님 결정).
      //
      // 이것이 없어서 버그가 있었다: 화면은 narration_lang 만 보내는데
      // buildClipPrompt(lib/cuts.js)는 **speech_lang** 을 읽는다(speechLangOf).
      // 그래서 일본어를 골라도 음성 언어가 기본값 "ko" 로 떨어져
      // `Says exactly, in Korean: "일본어 대사"` 라는 **모순된 지시**가 나갔다.
      // ★ 드러나는 자리가 **돈을 치른 뒤**라서 더 나쁘다(클립을 굽고 나서 들린다).
      // ★ 모르는 값은 기본값으로 떨어뜼린다 — 던지지 않는다(app/api/projects/route.js 와 같은 처방).
      speech_lang: isSubtitleLang(options.narration_lang) ? options.narration_lang : DEFAULT_SPEECH_LANG,

    },
  });
  return Response.json(project);
});
