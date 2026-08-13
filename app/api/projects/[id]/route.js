import { getProject, updateProject } from "../../../../lib/projects";
import { briefingContentChanged } from "../../../../lib/briefing";
import { clipLimitsForProject, I2V_MODEL_IDS } from "../../../../lib/clip-limits";
import { normalizeStyle } from "../../../../lib/styles";
import { isAspect } from "../../../../lib/aspects";
import { isSpeed } from "../../../../lib/speeds";
import { ownedPhotoKeys } from "../../../../lib/refs-io.js";
import { withUser } from "../../../../lib/auth/require-user.js";
import { alreadyChargedVideo } from "../../../../lib/charges.js";
import { TARGET_CHOICES } from "../../../../lib/script";
import { SUBTITLE_POSITIONS, normalizeSubtitle } from "../../../../lib/subtitles.js";

export const GET = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
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
    const project = await updateProject(id, user.id, (proj) => {
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
        // 버전은 "확정했다"가 아니라 "내용이 바뀌었다"에 묶는다 — 확정만 다시 눌러도 버전이 오르면
        // 대본 화면에 거짓 안내가 뜨고, 그 안내의 [대본 다시 쓰기]는 유료 호출이다.
        // 브리핑이 처음 생기는 저장은 "바뀐" 것이 아니다(직접 채우기 폴백) — 1에서 시작한다.
        const changed = proj.briefing ? briefingContentChanged(proj.briefing, next.briefing) : false;
        next.briefing.version = (proj.briefing?.version || 1) + (changed ? 1 : 0);
        // 초점이 바뀌면 컷을 비운다 — 화면과 캐스팅이 그것을 기준으로 다시 만들어져야 한다.
        // 실제로 달라졌을 때만 비운다: 같은 값으로 저장했는데 지우면 고쳐 둔 화면이 날아간다.
        const focusKey = (f) => `${f?.mode || ""}|${(f?.subject || "").trim()}`;
        if (focusKey(proj.briefing?.focus) !== focusKey(next.briefing?.focus)) {
          next.cuts = [];
          next.cuts_error = null;
        }
      }
      // 컷 한 줄 고치기 — 문장·화면·움직임. 준 것만 바꾼다(빈 값으로 지우지 않게).
      // 사장님이 구성 단계에서 손보는 자리다. 이미지·클립은 이 값들을 읽어 만든다.
      if (body.cut && Number.isInteger(body.cut.idx)) {
        const patch = {};
        for (const key of ["sentence", "shows", "motion"]) {
          if (typeof body.cut[key] === "string" && body.cut[key].trim()) {
            patch[key] = body.cut[key].trim();
          }
        }
        // 속도는 닫힌 목록이라 위 문자열 검사와 따로 본다 — 아무 낱말이나 들어가면
        // 클립 프롬프트에 모르는 값이 실리고, 대비 판정도 거짓이 된다.
        if (isSpeed(body.cut.speed)) patch.speed = body.cut.speed;
        if (Object.keys(patch).length) {
          next.cuts = proj.cuts.map((c) => (c.idx === body.cut.idx ? { ...c, ...patch } : c));
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
    return Response.json({ error: e.message }, { status: 404 });
  }
});
