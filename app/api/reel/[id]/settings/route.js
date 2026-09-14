// 설정을 고치는 유일한 문 — **열린 축만** 받는다.
//
// ★★ 문지기는 화면이 아니라 여기다. 화면에서 칩을 회색으로 칠하는 것은 예의이고, 주소로
//   직접 부르면 뚫린다. 잠금 판정은 lib/reel/locks.js 하나를 화면과 함께 쓴다.
// ★ 값 검증은 **기존 표**를 그대로 쓴다 — 목록을 여기에 다시 적으면 두 벌이 된다
//   (이 저장소의 "값이 사는 곳" 표: ASPECTS · STYLE_PRESETS · secondsForModel ·
//   isResolutionFor · reelAllowsModel).
import { withUser } from "../../../../../lib/auth/require-user.js";
import { getProject, updateProject } from "../../../../../lib/projects.js";
import { lockedAxes } from "../../../../../lib/reel/locks.js";
import { ASPECTS } from "../../../../../lib/aspects.js";
import { STYLE_PRESETS } from "../../../../../lib/styles.js";
import { isResolutionFor, reelAllowsModel, isReelModel, secondsForModel } from "../../../../../lib/clip-limits.js";
import { tierOf } from "../../../../../lib/tiers.js";
import { getStore } from "../../../../../lib/store/index.js";

const ok = (v, list) => list.some((x) => (typeof x === "object" ? x.id === v : x === v));

export const PATCH = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  // ★ 종류까지 본다 — 다른 흐름(단계별·광고)의 문서는 잠금 표도 설정 축도 다르다.
  //   reel 라우트 전부가 같은 모양이다(images/route.js).
  if (!project || project.kind !== "reel") {
    return Response.json({ error: "없는 영상이에요" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  // ★ 몸통이 객체가 아니면(`null`·배열·글자) 여기서 끊는다 — 아래 `in` 검사가 원시값에서
  //   던져 500 이 되고, 그러면 "무엇이 잘못됐나"가 사장님에게 안 닿는다.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "고칠 값이 없어요" }, { status: 400 });
  }

  const locks = lockedAxes(project);
  const axes = Object.keys(locks);
  const next = {};

  // ── ① 잠금 먼저. 값이 맞든 틀리든 잠긴 축은 애초에 못 고친다.
  // ★ 몸통의 키 순서가 아니라 **잠금 표의 순서**로 본다 — 몸통 키 순서는 보내는 쪽이
  //   정하므로, 그대로 따르면 같은 요청에 답이 갈린다.
  for (const axis of axes) {
    if (!(axis in body)) continue; // 안 보낸 축은 안 건드린다
    if (locks[axis].locked) {
      return Response.json({ error: locks[axis].reason }, { status: 409 });
    }
  }

  // ── ② 값 검증(축 하나로 판정되는 것). **모델이 맨 먼저다.**
  // ★ 화질은 모델에 딸려 있고(isResolutionFor), 길이는 아래 「결과 쌍」이 따로 본다.
  //   모르는 모델이 화질·길이와 함께 오면, 모델을 나중에 보는 순서에서는 "그 화질은
  //   안 돼요"라고 엉뚱하게 답한다 — 사장님이 멀쩡한 칩을 고치러 간다. 뿌리를 먼저 말한다.
  // ★ 목록을 손으로 다시 적지 않는다 — 잠금 표에서 모델만 앞으로 뽑아낸다.
  const order = ["i2v_model", ...axes.filter((a) => a !== "i2v_model")];
  for (const axis of order) {
    if (!(axis in body)) continue;
    const value = body[axis];
    if (axis === "aspect_ratio" && !ok(value, ASPECTS)) {
      return Response.json({ error: "그런 비율은 없어요" }, { status: 400 });
    }
    if (axis === "style" && !ok(value, STYLE_PRESETS)) {
      return Response.json({ error: "그런 화풍은 없어요" }, { status: 400 });
    }
    if (axis === "i2v_model") {
      // ★★ 만들 때와 **같은 두 겹**이다(app/api/reel/route.js). 한쪽만 지키면 화면 밖에서
      //   뚫린다 — 광고에서 화면만 거르고 서버는 그대로 받아 API 로 뚫렸던 사고가 근거다.
      //   ① 단계별이 여는 모델인가(isReelModel) ② 그 등급이 쓸 수 있는가(reelAllowsModel)
      // ★ 코드를 가른다: 모르는 모델은 **모르는 값**(400)이고, 등급에 막힌 것은
      //   **권한**(403)이다. 사장님이 할 일이 다르다 — 앞엣것은 다른 값을 고르는 것이고
      //   뒤엣것은 등급을 올리는 것이다.
      if (!isReelModel(value)) {
        return Response.json({ error: "그 모델은 아직 쓸 수 없어요" }, { status: 400 });
      }
      // ★ 관리자는 등급을 안 탄다 — 등급은 "손님이 무엇을 살 수 있나"이고 관리자는
      //   손님이 아니다(lib/tiers.js 의 머리말). 만들 때와 같은 판정이다.
      const admin = user.role === "admin";
      const tier = tierOf((await getStore().findProfiles([user.id])).get(user.id));
      if (!reelAllowsModel(tier, value, { admin })) {
        return Response.json({ error: "이 모델은 프로 등급부터 쓸 수 있어요" }, { status: 403 });
      }
    }
    if (axis === "resolution") {
      // ★★ 화질은 **모델에 딸려 있다** — 한 요청에 모델과 함께 오면 **새 모델** 기준으로
      //   재야 한다. 저장된 옛 모델로 재면, 갈아타면서 함께 보낸 화질이 "그 모델엔 없다"로
      //   잘못 거절되거나(둘 다 유효한데 400) 새 모델이 안 여는 화질이 통과한다.
      // ★ 모델은 위에서 이미 검증됐다(order 가 i2v_model 을 맨 앞에 둔다).
      // ★ isResolutionFor 는 project.settings.i2v_model 만 읽으므로(lib/clip-limits.js),
      //   실제 문서가 아니어도 그 모양만 흉내 내면 같은 판정을 쓴다 — 만들 때와 같은 관용구다.
      const nextModel = "i2v_model" in body ? body.i2v_model : project?.settings?.i2v_model;
      if (!isResolutionFor(value, { settings: { i2v_model: nextModel } })) {
        return Response.json({ error: "그 모델에서 못 쓰는 화질이에요" }, { status: 400 });
      }
    }
    next[axis] = value;
  }

  if (Object.keys(next).length === 0) {
    return Response.json({ error: "고칠 값이 없어요" }, { status: 400 });
  }

  // ★★★ Ruling 6 + 8 — 길이는 **그 모델이 한 번에 만들 수 있는 것** 안이어야 하고,
  //   그 검사는 **들어온 필드가 아니라 「결과 쌍」**에 건다.
  //
  //   ① 왜 길이를 모델에 매는가(Ruling 6): 생성 라우트(app/api/reel/route.js)가 이미
  //      secondsForModel 로 막는다. 고치는 문만 TARGET_CHOICES(15·30·45·60)를 보면
  //      만들 때는 못 하는 일이 고칠 때는 된다.
  //   ② 왜 「쌍」인가(Ruling 8): 들어온 필드만 재면 **반대 방향**이 열린다 —
  //      `{ i2v_model: "seedance-2.0" }` 하나만 보내면 그 요청은 target_seconds 를 한 번도
  //      안 보고 지나가, 2.5·30초 문서가 **2.0 + 30초**로 저장된다.
  //      ★ 도달 가능성이 높다: 모델과 길이는 **둘 다 시나리오 확정에서** 잠기므로 모델을
  //        고칠 수 있는 창이 곧 길이가 열려 있는 창이고, 화면은 **바뀐 축만** 보낸다.
  //   ⚠️ 왜 돈 문제인가: lib/reel/oneshot.js 가 저장된 길이를 새 모델 상한과 재서
  //      (`seconds <= oneShotMaxFor(project)`) 넘으면 **통짜(r2v) 대신 컷별 갈래**로
  //      떨어진다 — 15초짜리에 컷별로 48초를 굽고 40크레딧만 청구하던 그 구멍이다.
  //
  // ★ 검사를 **한 겹**으로 둔다(TARGET_CHOICES 를 함께 보지 않는다). secondsForModel 이
  //   이미 SELECTABLE_SECONDS 를 모델 상한으로 거른 결과라 언제나 그 부분집합이고,
  //   무엇보다 **생성 라우트와 같은 문 하나**여야 한다 — 두 겹이면 한쪽만 고쳐진다.
  // ★ `??` 가 아니라 `in` 으로 고른다. `??` 는 null 을 저장값으로 되돌려, 몸통이 보낸
  //   `target_seconds: null` 이 검사를 지나 그대로 저장된다 — 길이가 조용히 null 이 되는
  //   그 옛 함정이다(CLAUDE.md "이어서 할 일" 7번). 여기서 재는 것은 **저장될 값**이다.
  // ★★★ Ruling 9 — 이 검사는 **그 쌍이 바뀌는 요청**에만 건다.
  //   이 문의 일은 **나쁜 쌍을 만들지 않는 것**이지, 이미 나쁜 문서의 무관한 축을 잠그는
  //   것이 아니다 — 그 쌍은 이 문이 만든 것이 아니다(08-25 이전 reel 문서에는 길이가
  //   모델 상한 위이거나 아예 없는 것이 있다).
  //   ⚠️ 조건 없이 돌리면 **탈출구가 없어진다**: 2.0+30초 문서에 `{ style: "anime" }`
  //     하나를 보내도 "길이도 함께 바꿔 주세요"로 400 인데, **시나리오 확정 뒤에는 길이가
  //     잠겨(409) 그 지시를 따를 수 없다.** 고칠 수 없는 것을 고치라고 말하는 화면이 된다.
  //   ★ Important 1(모델만 내리기)은 그대로 막힌다 — 모델만 보내도 `i2v_model` 이 next 에
  //     들어오므로 검사가 돈다. 그 판이 깨지면 이 조건이 틀린 것이다.
  const touchesPair = "i2v_model" in next || "target_seconds" in next;
  const model = "i2v_model" in next ? next.i2v_model : project?.settings?.i2v_model;
  const seconds = "target_seconds" in next ? next.target_seconds : project?.settings?.target_seconds;
  const choices = secondsForModel(model);
  if (touchesPair && !choices.includes(seconds)) {
    // ⚠️ 길이를 **몰래 함께 내려 저장하지 않는다.** 사장님이 안 보낸 값을 저장이 조용히
    //   바꾸면 화면이 보여 준 것과 저장된 것이 갈린다. 막고, **무엇을 함께 바꿔야 하는지**
    //   말해 준다. 고를 값은 손으로 적지 않고 표에서 뽑아 붙인다.
    const list = `${choices.join("·")}초`;
    return Response.json(
      {
        error: "target_seconds" in next
          ? `그 모델이 한 번에 만들 수 있는 길이가 아니에요 — ${list} 중에서 골라 주세요`
          : `그 모델은 ${choices[choices.length - 1]}초까지예요 — 길이도 함께 바꿔 주세요(${list})`,
      },
      { status: 400 },
    );
  }
  // ★ **화질에는 같은 쌍 검사를 안 건다**(Ruling 8 의 선택지). 돈이 안 갈려서다:
  //   모델만 바꿔 저장된 화질이 새 모델 목록 밖이 되어도, **정가(requireVideoCharge)와
  //   fal 호출은 resolutionForProject 를 거친다**(app/api/reel/[id]/images/route.js ·
  //   clips/route.js) — 거기서 그 모델의 기본값으로 정규화된다.
  //   ⚠️ **"읽는 자리 전부"는 아니다**: lib/reel/oneshot.js(격자·칸 수)와
  //     app/api/reel/[id]/scenario/route.js 의 reelSceneCountRule 은 `settings.resolution`
  //     을 **날것으로** 읽는다. 오늘은 도달 불가다 — 단계별이 여는 두 모델(2.0·2.5)의
  //     화질 목록이 ["480p","720p"] 로 같아서 모델을 갈아타도 목록 밖이 될 수 없다.
  //     화질 목록이 갈리는 모델이 단계별에 열리는 날 이 자리를 다시 봐야 한다.
  //   ★ 길이에는 그 정규화가 아예 없어서 저장된 값이 그대로 갈래를 가른다 — 그래서
  //     길이만 여기서 막는다. (문서에 남는 옛 화질값은 원장에 미뤄 둔 별개 질문이다.)

  // ★ 길이는 이름이 둘이다 — target_seconds(정가·청구)와 seconds(시나리오 생성).
  //   한쪽만 고치면 값이 갈린다(app/api/reel/route.js 의 주석과 같은 이유).
  const merged = { ...next, ...(next.target_seconds ? { seconds: next.target_seconds } : {}) };
  const saved = await updateProject(id, user.id, (d) => ({ ...d, settings: { ...d.settings, ...merged } }));
  return Response.json({ settings: saved.settings });
});
