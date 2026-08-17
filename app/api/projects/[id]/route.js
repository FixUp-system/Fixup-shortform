import { getProject, updateProject } from "../../../../lib/projects";
import { clipLimitsForProject, I2V_MODEL_IDS, isResolutionFor, resolutionForProject } from "../../../../lib/clip-limits";
import { normalizeStyle, normalizePromptNote } from "../../../../lib/styles";
import { isAspect } from "../../../../lib/aspects";
import { isSpeed } from "../../../../lib/speeds";
import { MOTION_AXES } from "../../../../lib/motion.js";
import { ownedPhotoKeys } from "../../../../lib/refs-io.js";
import { withUser } from "../../../../lib/auth/require-user.js";
import { getStore } from "../../../../lib/store/index.js";
import { alreadyChargedVideo } from "../../../../lib/charges.js";
import { TARGET_CHOICES } from "../../../../lib/script";
import { SUBTITLE_POSITIONS, normalizeSubtitle } from "../../../../lib/subtitles.js";
import { isSubtitleLang } from "../../../../lib/subtitle-langs.js";
// 컷별 덮어쓰기 상한. 숫자를 여기서 새로 만들지 않는다 — **원장이 프롬프트를 자르는 자리**를
// 그대로 쓴다(lib/costs.js 의 LEDGER_PROMPT_MAX 주석에 왜 2000 인지가 있다).
import { LEDGER_PROMPT_MAX } from "../../../../lib/costs.js";

// 결제 뒤 화질 잠금이 **락 안에서** 걸렸다는 표식.
//
// 아래 PATCH 의 catch 는 "프로젝트가 없다"를 404 로 옮기는 자리다 — 그 자리에 이 오류가
// 맨 Error 로 들어가면 잠금이 404 로 뭉개진다. 이름 있는 오류로 갈라서 **사전 판정과 같은
// 400·같은 문구**로 답한다(NoCredits·BudgetExceeded 와 같은 관용구다).
//
// 문구는 한 곳에서만 적는다 — 두 자리(사전 판정·락 안 판정)가 같은 답을 내야 한다.
const RESOLUTION_LOCKED = "이미 결제된 영상은 화질을 바꿀 수 없어요 — 새로 만들어 주세요";
class ResolutionLocked extends Error {
  constructor() {
    super(RESOLUTION_LOCKED);
    this.name = "ResolutionLocked";
  }
}

export const GET = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  // ★ 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!project || project.kind === "ad") return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  // 이 프로젝트가 고른 모델의 클립 상한을 함께 실어 보낸다 — 저장하지 않고 요청마다 푼다.
  // 화면은 모델별 눈금표를 갖고 있지 않아서, 이 값 없이는 폴백 프로필로 판정한다.
  //
  // charged = 이 프로젝트의 정가를 냈고 아직 되돌려받지 않았는가. 화면이 "여기서
  // N 크레딧이 나갑니다"를 **낼 때만** 적기 위한 값이다. 프로젝트 문서로는 알 수 없다 —
  // 돈이 오간 사실은 장부에만 있고(auto 실패는 환불된다) 문서의 auto·render 로 추측하면
  // 환불받은 프로젝트에 "이미 냈다"고 거짓말한다.
  return Response.json({
    ...project,
    clip_limits: clipLimitsForProject(project),
    charged: await alreadyChargedVideo(id),
  });
});

export const PATCH = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // settings 는 화이트리스트 없이 머지되므로 닫힌 목록은 여기서 판정한다. 막지 않으면 아무
  // 값이나 들어가고 그 값으로 유료 호출이 나간다. 모르는 값을 조용히 기본으로 바꾸지도 않는다
  // — 사장님이 고른 것과 실제로 만들어지는 것이 달라지면 아무도 못 알아본다.
  //
  // 락을 잡기 전에 판정한다. 아래 try 는 "프로젝트가 없다"를 404 로 돌려주는 자리라,
  // 그 안에서 던지면 잘못된 값이 없는 프로젝트로 보고된다.
  if (body.settings?.aspect_ratio !== undefined && !isAspect(body.settings.aspect_ratio)) {
    return Response.json({ error: "그 사이즈는 몰라요" }, { status: 400 });
  }

  // 영상 모델도 닫힌 목록이다. 모르는 값이 들어가면 clip-limits 가 조용히 레거시로
  // 떨어뜨리는데, 고른 것과 만들어지는 것이 달라지면 아무도 못 알아본다.
  if (
    body.settings?.i2v_model !== undefined &&
    !I2V_MODEL_IDS.includes(body.settings.i2v_model)
  ) {
    return Response.json({ error: "그 영상 모델은 몰라요" }, { status: 400 });
  }

  // 자막 위치도 닫힌 목록이다. 모르는 값이 들어가면 합성이 조용히 아래로 떨어뜨리는데
  // (lib/subtitles.js), 고른 것과 만들어지는 것이 달라지면 아무도 못 알아본다.
  if (
    body.settings?.subtitle_position !== undefined &&
    !SUBTITLE_POSITIONS.includes(body.settings.subtitle_position)
  ) {
    return Response.json({ error: "그 자막 위치는 몰라요" }, { status: 400 });
  }

  // ★ 길이는 정가를 정한다(lib/pricing.js 의 VIDEO_PRICE). 만들 때는 검증하는데
  // (app/api/projects/route.js) 고칠 때는 안 봐서, 15초로 25크레딧 낸 뒤 60초로 고치면
  // 추가 청구가 0 이었다. 두 겹으로 막는다 — 아는 값인가, 그리고 이미 팔았는가.
  if (body.settings?.target_seconds !== undefined) {
    if (!TARGET_CHOICES.includes(body.settings.target_seconds)) {
      return Response.json({ error: "그 길이는 몰라요" }, { status: 400 });
    }
    // 정가를 낸 뒤 길이를 바꾸면 낸 값과 만드는 값이 어긋난다. 차액 청구는 만들지 않았다
    // (청구 장부가 회차·멱등키 기반이라 차액 개념이 없다) — 그래서 못 바꾸게 한다.
    // 같은 값을 다시 보내는 것은 막지 않는다: 다른 설정을 고치는 정상 저장이다.
    const project = await getProject(id, user.id);
    // ★ 광고 문서는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다. 여기서 먼저 막지 않으면
    // 아래 alreadyChargedVideo 판정(기존 종류의 청구 장부)이 광고 문서에 얹혀 404 대신
    // 다른 상태 코드가 나갈 수 있다.
    if (project?.kind === "ad") {
      return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
    }
    if (
      project &&
      body.settings.target_seconds !== project.settings?.target_seconds &&
      (await alreadyChargedVideo(id))
    ) {
      return Response.json(
        { error: "이미 결제된 영상은 길이를 바꿀 수 없어요 — 새로 만들어 주세요" },
        { status: 400 }
      );
    }
  }

  // 화질도 닫힌 목록이다 — 다만 **목록이 모델마다 다르다**(Seedance 만 연다). 그래서
  // 상수 배열이 아니라 isResolutionFor 가 판정한다(lib/clip-limits.js 가 유일한 자리다).
  // 안 막으면 아무 값이나 settings 에 들어가고, 그 값이 그대로 fal 유료 호출로 나간다.
  //
  // ★ **머지 뒤 모델**로 잰다. 저장된 모델로 재면 모델을 함께 바꾸는 PATCH 에서
  //   "Seedance 의 1080p 니까 통과"가 되고 저장되는 모델은 Kling 이 된다 — 그 모델에는
  //   해상도 파라미터 자체가 없는데 문서에는 남아 각인(lib/steps.js)이 그것을 본다.
  //
  // ★★ **모델 잠금보다 먼저 판정한다.** 뒤에 두면 모델을 함께 바꾸는 요청을 모델 잠금이
  //   먼저 400 으로 돌려보내, 이 문이 실제로 무는지를 **어떤 테스트도 못 잰다**
  //   (리뷰 실측: merged → project 로 되돌려도 11건 전부 그린이었다). 순서가 곧 회귀
  //   방어다 — 이 문이 스스로 답을 내야 그것이 틀렸을 때 눈에 띈다.
  if (body.settings?.resolution !== undefined) {
    const project = await getProject(id, user.id);
    // ★ 광고 문서는 이 경로가 다루지 않는다 — 아래 결제 잠금이 기존 종류의 청구 장부를
    // 묻기 전에 막는다(target_seconds 블록과 같은 이유).
    if (project?.kind === "ad") {
      return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
    }
    const merged = { ...project, settings: { ...project?.settings, ...body.settings } };
    // 없는 프로젝트는 여기서 400 을 주지 않는다 — 아래 updateProject 가 404 로 답한다.
    if (project && !isResolutionFor(body.settings.resolution, merged)) {
      return Response.json({ error: "그 화질은 몰라요" }, { status: 400 });
    }
    // ★★ 돈이 새던 자리 — **화질은 정가를 바꾼다**(Seedance 30초: 720p 160 · 1080p 360).
    // 정가는 ③목소리에서 걷히고 화질 칩은 ②대본에 있다. 결제 뒤에 바꾸면
    // requireVideoCharge 가 **살아 있는 청구를 보고 그냥 지나가서**(lib/charges.js)
    // 160 을 내고 원가 2.25배짜리를 받는다. 차액 청구는 만들지 않았다(청구 장부가
    // 회차·멱등키 기반이라 차액 개념이 없다) — 그래서 못 바꾸게 한다.
    //
    // ★ 잠금 기준이 **결제**다(모델처럼 생성 시점이 아니다). 새는 구간이 결제와 첫 클립
    //   사이라 "첫 클립 뒤"로는 늦고, ②대본 칩이 이미 project.charged 로 잠그므로
    //   화면과 서버가 같은 것을 본다(GET 이 실어 보내는 alreadyChargedVideo 그 값이다).
    //   환불받은 프로젝트는 살아 있는 청구가 없어 다시 고를 수 있다 — 다시 돌리면
    //   새 회차로 정가를 다시 받으므로 어긋나지 않는다.
    //
    // ★ 비교는 **날것이 아니라 실제로 값을 치른 화질**(resolutionForProject)로 한다.
    //   저장값이 없는 프로젝트는 720p 로 청구되므로 720p 를 명시로 보내는 것은 바꾸는
    //   것이 아니다 — 날것으로 재면 화면의 정상 저장이 400 이 된다.
    //
    // ★★★ 여기는 **빠른 실패**일 뿐이다 — 진짜 잠금은 아래 뮤테이터 안에 있다.
    //   이 판정은 updateProject 의 직렬 큐·version **밖**이라 읽고-나서-쓰기다:
    //   PATCH(1080p) 와 ③목소리 결제를 동시에 쏘면 PATCH 가 charged=false 를 읽고 →
    //   그사이 720p 로 청구가 확정되고 → 1080p 가 저장된다. 이 문이 막으려던 바로 그
    //   시나리오가 그대로 통한다. 그래서 락 안에서 한 번 더 판정한다.
    if (
      project &&
      body.settings.resolution !== resolutionForProject(project) &&
      (await alreadyChargedVideo(id))
    ) {
      return Response.json({ error: RESOLUTION_LOCKED }, { status: 400 });
    }
  }

  // ★ 영상 모델은 **만들 때 한 번** 정해지고 그 뒤로는 안 바뀐다(2026-08-13 사용자 결정).
  // 고르는 자리는 자료 화면(app/create/page.js)이고, 값은 POST /api/projects 로 함께 온다.
  //
  // 왜 뒤에서 못 바꾸나: 모델이 정가를 정하는데(videoPrice(seconds, model)) 정가는
  // ③목소리·④이미지에서 걷힌다. 뒤에서 바꾸면 낸 값과 만드는 값이 어긋난다 —
  //   · Seedance 로 160 을 내고 Kling 으로 바꾸면 → 사장님이 110 크레딧을 잃는다
  //   · Kling 으로 50 을 내고 Seedance 로 바꾸면 → 우리가 편당 ~$6 를 태운다
  // 차액 정산은 만들지 않는다(청구 장부가 회차·멱등키 기반이라 차액 개념이 없다).
  // 게다가 클립 생성이 도는 1~3분 동안 바뀌면 한 편 안에 두 모델이 섞인다.
  //
  // ★ 결제 여부로 재지 않는다 — "안 냈으면 바꿔도 된다"로 두면 ②대본에서 바꾼 값과
  // ③에서 걷는 값이 서로 다른 창이 생긴다. 생성 시점 하나가 자다.
  // 같은 값을 다시 보내는 것은 막지 않는다: 화면이 헛 PATCH 를 보내도 400 이 뜨면 안 된다.
  if (body.settings?.i2v_model !== undefined) {
    const project = await getProject(id, user.id);
    if (project && body.settings.i2v_model !== project.settings?.i2v_model) {
      return Response.json(
        { error: "영상 모델은 만들 때 정해져요 — 바꾸려면 새로 만들어 주세요" },
        { status: 400 }
      );
    }
  }

  // 프로젝트 공통 지시 두 칸 — 사장님이 밖에서 써 온 프롬프트를 그대로 넣는 자리다.
  // settings 는 화이트리스트 없이 얕게 머지된다 — 여기서 안 막으면 아무 값이나 들어가고
  // 그 값이 그대로 유료 호출로 나간다(이 파일 113행 주석과 같은 이유).
  //
  // ★ 정규화한 값을 **되돌려 담는다**(normalizeStyle 이 style 을 담는 것과 같다) — 저장되는
  //   값과 프롬프트가 읽는 값이 갈리면 안 된다. 상한을 넘으면 자르지 않고 400 이다.
  // ★ 화풍 보정(settings.style.note)과 **다른 칸이다.** 그쪽은 상한이 120자라 밖에서 써 온
  //   프롬프트는 붙여넣기부터 거절당한다(lib/styles.js 의 STYLE_NOTE_MAX 주석 참고).
  for (const [key, label] of [["image_note", "이미지 지시"], ["clip_note", "영상 지시"]]) {
    if (body.settings?.[key] === undefined) continue;
    try {
      body.settings[key] = normalizePromptNote(body.settings[key], label);
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  }

  // 컷별 프롬프트 덮어쓰기 길이 상한.
  //
  // ★ 상한이 필요한 이유: 이 값은 본문을 통째로 대체해 **그대로 유료 fal 호출로 나간다**
  //   (형제 격인 프로젝트 공통 지시도 그래서 600자 상한이다 — lib/styles.js).
  // ★ 값은 **원장이 프롬프트를 자르는 자리**(LEDGER_PROMPT_MAX)를 그대로 쓴다. 그 위로 쓰면
  //   원장에 안 남아 "무엇을 보냈는가"를 확인할 채널이 막힌다 — 그 주석이 계측기라고 부르는
  //   값이다. 본문이 프롬프트 맨 앞이라(promptBodyOf 의 불변) 상한을 본문에 걸면 원장 앞
  //   2000자 안에 사장님이 쓴 글이 통째로 들어온다.
  // ★ 자르지 않고 **400 으로 되돌린다** — 자르면 사장님이 쓴 글의 뒷부분이 조용히 사라진
  //   프롬프트로 값을 치른다(공통 지시와 같은 규칙이다).
  // ★ 저장 **전에** 막는다 — 뒤(updateProject 안)에서 던지면 같은 요청의 다른 값이 절반만
  //   저장되거나 catch 가 404 로 뭉갠다.
  for (const [key, label] of [["image_prompt", "이미지 프롬프트"], ["clip_prompt", "영상 프롬프트"]]) {
    if (typeof body.cut?.[key] !== "string") continue;
    // 공백을 걷은 뒤로 잰다 — 저장되는 값이 그것이다(아래 화이트리스트가 trim 한다).
    const len = body.cut[key].trim().length;
    if (len > LEDGER_PROMPT_MAX) {
      // 문구 어조는 normalizePromptNote 와 같다 — 상한과 지금 글자 수를 함께 말한다.
      return Response.json(
        { error: `${label}는 ${LEDGER_PROMPT_MAX}자까지예요 (지금 ${len}자).` },
        { status: 400 }
      );
    }
  }

  let style;
  if (body.settings?.style !== undefined) {
    try {
      style = normalizeStyle(body.settings.style);
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  }

  // 남의 업로드 키를 material.photos 로 심으려는 시도를 막는다 — 리뷰 I2.
  // 사진마다 upload_owners 를 물어 이 사용자 것이 아니면(주인 기록이 없는 경우 포함) 거부한다.
  if (Array.isArray(body.material?.photos) && !(await ownedPhotoKeys(body.material.photos, user.id))) {
    return Response.json({ error: "본인이 올린 사진만 쓸 수 있어요" }, { status: 400 });
  }

  try {
    const project = await updateProject(id, user.id, async (proj) => {
      // ★ 광고 문서는 이 경로가 다루지 않는다 — target_seconds 가 없는 본문(예: material 만
      // 고치는 요청)은 위 getProject 가드를 안 거치므로 여기서 다시 막는다. 여기서 던지면
      // 아래 catch 가 기존 문구 그대로 404 로 감싼다 — 없는 것과 같은 취급이다.
      if (proj.kind === "ad") throw new Error("프로젝트를 찾을 수 없어요");
      // ★★ 화질 잠금의 **진짜 자리** — 여기는 직렬 큐·version 안이고, 저장 직전이다.
      // 위 사전 판정만 두면 결제와 PATCH 를 동시에 쏘는 순서가 그대로 통한다(그 주석 참고).
      //
      // ★ 판정 기준은 위와 글자 그대로 같다 — **지금 문서**가 치른 화질(resolutionForProject)과
      //   다른 값을 살아 있는 청구가 있는데 넣으려 하는가. 재시도(CAS 패배)로 다시 불려도
      //   같은 답을 내고, 읽기만 하므로 부작용이 없다.
      if (
        body.settings?.resolution !== undefined &&
        body.settings.resolution !== resolutionForProject(proj) &&
        (await alreadyChargedVideo(id))
      ) {
        throw new ResolutionLocked();
      }
      const next = { ...proj };
      if (body.material) next.material = { ...proj.material, ...body.material };
      if (body.settings) {
        next.settings = { ...proj.settings, ...body.settings };
        if (style) next.settings.style = style;
        // ★ 자막 설정은 400 으로 막지 않는다 — 닫힌 목록인 모델·길이·자막 위치와 다르다.
        // 되돌려도 사장님이 잃는 것이 없고(다시 고르면 된다), 슬라이더를 끌다가 400 이
        // 뜨면 성가시다. 되돌리기 규칙은 lib/subtitles.js 하나가 쥔다(화면도 같은 것을 본다).
        //
        // 준 요청에서만 손댄다 — 자막과 무관한 저장(예: 화풍)에서 기본값을 **명시로**
        // 박으면 각인이 달라져(lib/steps.js) 픽셀이 같은 완성본을 다시 굽게 된다.
        if (body.settings.subtitle !== undefined) {
          next.settings.subtitle = normalizeSubtitle(body.settings.subtitle);
        }
      }
      if (body.briefing) {
        next.briefing = { ...proj.briefing, ...body.briefing };
        // ★ 브리핑 버전을 올리던 자리는 걷어냈다(2026-08-16). 그 번호를 읽던 것은 ②대본
        //   화면의 "브리핑이 바뀌었어요" 안내 하나였고 그 화면이 사라졌다 — 아무도 안 보는
        //   번호를 올려 두면 다음 사람이 "누군가 본다"고 읽는다(lib/briefing.js 의 같은 주석).
        //   옛 프로젝트에 저장돼 있는 version 값은 위 전개로 그대로 남는다(지우지 않는다).
        // 초점이 바뀌면 컷을 비운다 — 화면과 캐스팅이 그것을 기준으로 다시 만들어져야 한다.
        // 실제로 달라졌을 때만 비운다: 같은 값으로 저장했는데 지우면 고쳐 둔 화면이 날아간다.
        const focusKey = (f) => `${f?.mode || ""}|${(f?.subject || "").trim()}`;
        if (focusKey(proj.briefing?.focus) !== focusKey(next.briefing?.focus)) {
          next.cuts = [];
          next.cuts_error = null;
        }
      }
      // 컷 한 줄 고치기 — 문장·화면·움직임(옛 motion 과 세 축). 준 것만 바꾼다(빈 값으로 지우지 않게).
      // 사장님이 구성 단계에서 손보는 자리다. 이미지·클립은 이 값들을 읽어 만든다.
      //
      // ★ 축 이름을 손으로 적지 않는다 — MOTION_AXES 에서 판다. 이 브랜치의 되돌리기
      //   안전장치가 "목록에서 축 한 줄을 빼면 지문·검증·프롬프트·각인·판정·화면이 함께
      //   줄어든다"이고, 여기에 "camera" 를 박으면 그 줄이 빠져도 이 문만 계속 열려 있다.
      //
      // ⚠️ 축을 고치면 클립이 낡는다(clipKey 가 axesOf 를 본다) — 값이 바뀌었으니 맞다.
      //    낡음은 자동 청구가 아니라 "다시 만들기" 표시다.
      if (body.cut && Number.isInteger(body.cut.idx)) {
        const patch = {};
        for (const key of ["sentence", "shows", "motion", ...MOTION_AXES.map((a) => a.id)]) {
          if (typeof body.cut[key] === "string" && body.cut[key].trim()) {
            patch[key] = body.cut[key].trim();
          }
        }
        // ★ 프롬프트 덮어쓰기는 **비울 수 있어야 한다** — 그것이 "원래대로" 버튼이다
        //   (별도 필드를 두지 않기로 한 설계다). 위 루프는 trim() 이 참일 때만 담으므로
        //   빈 값이 통째로 무시된다 — 담기기만 하고 지워지지 않는다. 그래서 따로 본다.
        //
        // ★ 비우면 **필드를 지운다**(빈 문자열로 남기지 않는다). 빈 문자열은 각인에 안
        //   잡히지만(lib/cuts.js promptOverride 가 공백을 덮어쓰기로 안 본다) 컷 모양이
        //   옛 컷과 달라진다 — 이 저장소는 "옛 컷과 글자 그대로 같은 모양"을 각인의
        //   전제로 쓴다.
        //
        // ★ 문자열이 아닌 값은 **아무 일도 안 한다.** 담으면 그 값이 그대로 유료 호출로
        //   나가고(위 113행 주석과 같은 이유), 지우면 잘못 보낸 한 번이 사장님이 적어 둔
        //   프롬프트를 날린다.
        for (const key of ["image_prompt", "clip_prompt"]) {
          if (typeof body.cut[key] !== "string") continue;
          const v = body.cut[key].trim();
          patch[key] = v || undefined;   // undefined = 아래 머지에서 지운다
        }
        // 속도는 닫힌 목록이라 위 문자열 검사와 따로 본다 — 아무 낱말이나 들어가면
        // 클립 프롬프트에 모르는 값이 실리고, 대비 판정도 거짓이 된다.
        if (isSpeed(body.cut.speed)) patch.speed = body.cut.speed;
        // 번역 손보기(⑥완성 화면) — 사장님이 눌러서 고친 자막 번역. 한국어는 원문이 곧
        // 자막이라 대상이 아니다(lib/translate.js isSubtitleStale 도 같은 전제).
        // ★ of 를 **지금 문장**으로 다시 찍는다 — 안 그러면 isSubtitleStale 이 방금 고친
        // 번역을 여전히 낡음으로 잡아, 다음에 자막을 구울 때 모델이 손으로 고친 것을 덮어쓴다.
        const currentCut = proj.cuts.find((c) => c.idx === body.cut.idx);
        if (
          isSubtitleLang(body.cut.subtitleLang) && body.cut.subtitleLang !== "ko" &&
          typeof body.cut.subtitleText === "string" && body.cut.subtitleText.trim() && currentCut
        ) {
          patch.subtitles = {
            ...currentCut.subtitles,
            [body.cut.subtitleLang]: { text: body.cut.subtitleText.trim(), of: currentCut.sentence },
          };
        }
        if (Object.keys(patch).length) {
          // ★ 전개만으로는 못 지운다 — `{...c, image_prompt: undefined}` 는 값이 undefined
          //   인 **키가 남는다**("image_prompt" in cut 이 참이고, JSON 직렬화에서 사라져
          //   저장소마다 답이 갈린다). 지우는 것은 delete 뿐이다.
          next.cuts = proj.cuts.map((c) => {
            if (c.idx !== body.cut.idx) return c;
            const merged = { ...c, ...patch };
            for (const k of Object.keys(patch)) if (patch[k] === undefined) delete merged[k];
            return merged;
          });
          // 문장을 고쳤으면 원고도 함께 따라온다.
          //
          // 컷은 원고를 잘라서 만들고 "이어붙이면 원고와 글자 그대로 같다"가 이 파이프라인의
          // 유일한 구조적 보장이다. 컷만 고치고 원고를 두면 그 보장이 깨지고, 나중에 컷을 다시
          // 나누는 순간(POST /cuts 는 script.text 를 자른다) 고친 문장이 조용히 사라진다.
          //
          // version 은 올리지 않는다 — 올리면 ②대본에 "원고가 바뀌었어요" 거짓 경고가 뜨고
          // 그 안내의 버튼은 유료 호출이다. 게다가 컷이 낡은 것으로 판정돼 자동 재분할이 돌아
          // 방금 고친 문장이 덮인다. 화면·움직임만 고쳤을 때는 원고와 무관하므로 건드리지 않는다.
          if (patch.sentence && proj.script) {
            next.script = { ...proj.script, text: next.cuts.map((c) => c.sentence).join(" ") };
          }
        }
      }
      // 원고 직접 편집. version을 올리지 않는다 — 사장님이 손으로 고친 것을
      // "원고가 바뀌었다"로 알리면 이미지 화면에 거짓 경고가 뜨고, 그 버튼은 유료 호출이다.
      // (손으로 고친 문장을 컷에 반영하려면 컷을 다시 만들어야 하는 것은 그대로다.)
      if (typeof body.script_text === "string" && body.script_text.trim() && proj.script) {
        next.script = { ...proj.script, text: body.script_text.trim() };
      }
      return next;
    });
    return Response.json(project);
  } catch (e) {
    // 락 안 잠금은 "없는 프로젝트"가 아니다 — 사전 판정과 같은 400·같은 문구로 답한다.
    if (e instanceof ResolutionLocked) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    return Response.json({ error: e.message }, { status: 404 });
  }
});

// DELETE /api/projects/[id] — 보관함에서 지운다.
//
// ★ 장부는 **건드리지 않는다.** 지우면 환불이 되면 "만들고 지워서 되돌려받는" 길이 열린다.
// 돈이 오간 사실은 프로젝트 문서가 아니라 credit_charges 에 있고, 장부는 무슨 일이 있었는지
// 남기는 것이 일이다(환불조차 행을 지우지 않고 음수 행을 더한다 — lib/charges.js).
//
// ★ 완성본 파일은 **함께 지운다.** 저장 용량이 진짜 제약이다 — 자막 원본(-raw.mp4) 때문에
// 편당 ~20MB 라 무료 플랜 1GB 면 50편에서 찬다. 지우기가 그 용량을 되찾는 유일한 길이다.
// 파일 삭제가 실패해도 프로젝트 삭제를 막지 않는다: 사장님이 요청한 일은 "목록에서 치우는
// 것"이고, 파일은 이미 없을 수도 있다(가짜 모드·합성 전 프로젝트). 실패는 로그로 남긴다.
//
// ★ 올린 사진(uploads)은 안 지운다 — 같은 사진을 다른 프로젝트가 쓰고 있을 수 있다.
// upload_owners 는 키의 주인만 기록하고 "어느 프로젝트가 쓰는지"는 모른다.
export const DELETE = withUser(async (_req, { params }, user) => {
  const { id } = await params;

  // 소유자 확인은 스토어가 한다(owner_id 를 조건에 넣는다) — 없는 것과 남의 것을
  // 같은 404 로 답해 존재 여부를 흘리지 않는다(GET·PATCH 와 같은 규칙).
  const gone = await getStore().deleteProject(id, user.id);
  if (!gone) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  for (const key of [`${id}.mp4`, `${id}-raw.mp4`]) {
    await getStore().deleteObject("renders", key).catch((e) => {
      console.error("완성본 삭제 실패:", key, e?.message);
    });
  }

  return Response.json({ ok: true });
});
