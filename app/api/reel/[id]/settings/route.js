// 설정을 고치는 유일한 문 — **열린 축만** 받는다.
//
// ★★ 문지기는 화면이 아니라 여기다. 화면에서 칩을 회색으로 칠하는 것은 예의이고, 주소로
//   직접 부르면 뚫린다. 잠금 판정은 lib/reel/locks.js 하나를 화면과 함께 쓴다.
// ★ 값 검증은 **기존 표**를 그대로 쓴다 — 목록을 여기에 다시 적으면 두 벌이 된다
//   (이 저장소의 "값이 사는 곳" 표: ASPECTS · TARGET_CHOICES · STYLE_PRESETS ·
//   isResolutionFor · reelAllowsModel).
import { withUser } from "../../../../../lib/auth/require-user.js";
import { getProject, updateProject } from "../../../../../lib/projects.js";
import { lockedAxes } from "../../../../../lib/reel/locks.js";
import { ASPECTS } from "../../../../../lib/aspects.js";
import { TARGET_CHOICES } from "../../../../../lib/script.js";
import { STYLE_PRESETS } from "../../../../../lib/styles.js";
import { isResolutionFor, reelAllowsModel, isReelModel } from "../../../../../lib/clip-limits.js";
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
  const next = {};

  // ★ 몸통의 키 순서가 아니라 **잠금 표의 순서**로 돈다. 이유는 i2v_model 이 resolution
  //   보다 먼저여야 하기 때문이다 — 화질은 모델에 딸려 있어서(아래), 모르는 모델이 함께
  //   왔을 때 "그 모델은 못 쓴다"가 아니라 "그 화질은 못 쓴다"로 답하면 사장님이 엉뚱한
  //   칩을 고치게 된다. 몸통 키 순서는 보내는 쪽이 정하므로 믿을 것이 못 된다.
  for (const axis of Object.keys(locks)) {
    if (!(axis in body)) continue; // 안 보낸 축은 안 건드린다
    const value = body[axis];
    if (locks[axis].locked) {
      return Response.json({ error: locks[axis].reason }, { status: 409 });
    }
    if (axis === "aspect_ratio" && !ok(value, ASPECTS)) {
      return Response.json({ error: "그런 비율은 없어요" }, { status: 400 });
    }
    if (axis === "target_seconds" && !TARGET_CHOICES.includes(value)) {
      return Response.json({ error: "그런 길이는 없어요" }, { status: 400 });
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
      // ★★ 화질은 **모델에 딸려 있다** — 한 요청에 모델과 화질이 함께 오면 **새 모델**
      //   기준으로 재야 한다. 저장된 옛 모델로 재면, 모델을 갈아타면서 함께 보낸 화질이
      //   "그 모델에는 없는 값"으로 잘못 거절되거나(둘 다 유효한데 400), 반대로 새 모델이
      //   안 여는 화질이 통과한다. 뒤엣것은 값을 치른 뒤 fal 이 거절하는 자리다.
      // ★ isResolutionFor 는 project.settings.i2v_model 만 읽으므로(lib/clip-limits.js),
      //   실제 문서가 아니어도 그 모양만 흉내 내면 같은 판정을 쓴다 — 만들 때와 같은 관용구다.
      const model = "i2v_model" in body ? body.i2v_model : project?.settings?.i2v_model;
      if (!isResolutionFor(value, { settings: { i2v_model: model } })) {
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
