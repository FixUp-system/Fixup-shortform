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

  // ── ② 값 검증. **모델이 맨 먼저다.**
  // ★ 길이도 화질도 모델에 딸려 있다(secondsForModel · isResolutionFor). 모르는 모델이
  //   길이·화질과 함께 오면, 모델을 나중에 보는 순서에서는 "그 길이는 안 돼요"라고
  //   엉뚱하게 답한다 — 사장님이 멀쩡한 칩을 고치러 간다. 잘못된 뿌리를 먼저 말한다.
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
    // ★★★ 길이·화질은 **모델에 딸려 있다** — 한 요청에 모델과 함께 오면 **새 모델**
    //   기준으로 재야 한다. 저장된 옛 모델로 재면 두 쪽으로 틀린다: 갈아타면서 함께 보낸
    //   값이 "그 모델엔 없다"로 잘못 거절되거나(둘 다 유효한데 400), 반대로 새 모델이
    //   안 여는 값이 통과한다. 뒤엣것은 값을 치른 뒤에야 드러난다.
    // ★ 모델은 위에서 이미 검증됐다(order 가 i2v_model 을 맨 앞에 둔다) — 여기 오는
    //   nextModel 은 이 사장님이 실제로 쓸 수 있는 모델이다.
    const nextModel = "i2v_model" in body ? body.i2v_model : project?.settings?.i2v_model;
    if (axis === "target_seconds") {
      // ★★★ Ruling 6 — 길이는 **그 모델이 한 번에 만들 수 있는 것** 안에서만 고른다.
      //   생성 라우트(app/api/reel/route.js)가 이미 secondsForModel 로 막는데 여기만
      //   TARGET_CHOICES(15·30·45·60)를 보면, 만들 때는 못 하는 일이 고칠 때는 된다.
      //   ⚠️ 그게 왜 돈 문제인가: target_seconds 가 모델 상한을 넘으면
      //   sceneMinSecondsFor 의 통짜 판정(`seconds <= maxSecondsFor`)이 거짓이 되어
      //   **통짜(r2v) 대신 컷별 갈래**로 떨어진다 — 15초짜리에 컷별로 48초를 굽고
      //   40크레딧만 청구하던 그 구멍이다(OUTSTANDING.md).
      // ★ 검사를 **한 겹**으로 둔다(TARGET_CHOICES 를 함께 보지 않는다). 이유는
      //   secondsForModel 이 이미 SELECTABLE_SECONDS 를 모델 상한으로 거른 결과라
      //   언제나 그 부분집합이고, 무엇보다 **생성 라우트와 같은 문 하나**여야 하기
      //   때문이다 — 두 겹이면 어느 날 한쪽만 고쳐지고 그때 두 문이 갈린다.
      const choices = secondsForModel(nextModel);
      if (!choices.includes(value)) {
        return Response.json(
          { error: `그 모델이 한 번에 만들 수 있는 길이가 아니에요 — ${choices.join("·")}초 중에서 골라 주세요` },
          { status: 400 },
        );
      }
    }
    if (axis === "resolution") {
      // ★ isResolutionFor 는 project.settings.i2v_model 만 읽으므로(lib/clip-limits.js),
      //   실제 문서가 아니어도 그 모양만 흉내 내면 같은 판정을 쓴다 — 만들 때와 같은 관용구다.
      if (!isResolutionFor(value, { settings: { i2v_model: nextModel } })) {
        return Response.json({ error: "그 모델에서 못 쓰는 화질이에요" }, { status: 400 });
      }
    }
    next[axis] = value;
  }

  if (Object.keys(next).length === 0) {
    return Response.json({ error: "고칠 값이 없어요" }, { status: 400 });
  }

  // ★ 길이는 이름이 둘이다 — target_seconds(정가·청구)와 seconds(시나리오 생성).
  //   한쪽만 고치면 값이 갈린다(app/api/reel/route.js 의 주석과 같은 이유).
  const merged = { ...next, ...(next.target_seconds ? { seconds: next.target_seconds } : {}) };
  const saved = await updateProject(id, user.id, (d) => ({ ...d, settings: { ...d.settings, ...merged } }));
  return Response.json({ settings: saved.settings });
});
