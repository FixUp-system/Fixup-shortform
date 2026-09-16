"use client";
// 이 영상의 설정 — **늘 보인다.**
//
// ★★ 잠금은 lib/reel/locks.js 하나가 판정한다. 여기서 scenario.text 나 cuts[].image.url 을
//   다시 읽지 마라 — 그 순간 판정이 두 벌이 되고, 한쪽만 고쳐지는 날이 온다.
// ★★ 목록(비율·길이·화풍)은 **표에서 온다.** 화면에 이름이나 숫자를 적으면 값이 갈린다.
// ★ 잠긴 축도 **값은 보여 준다** — 무엇으로 만들었는지가 화면에서 사라지면 안 된다.
//
// ★★★ 값·크레딧은 여기서 **한 글자도 말하지 않는다**(2026-09-14 Ruling 10).
//   값·크레딧 문구는 ⑤영상에서만 말한다(사장님 규칙) — 여기서 말하면 같은 값이 두 곳에서
//   갈린다. 게다가 이 패널은 ①~⑥ 어느 단계에서나 서 있어서, 정가 줄을 달면 "돈이 나가는
//   자리는 ⑤ 하나"라는 신호가 통째로 흐려진다. 그래서 lib/pricing.js 를 **import 하지도
//   않는다** — 부르지 않더라도 import 가 있으면 다음 사람이 그 줄을 되살리기 쉽다.
//   판: tests/reel-settings-panel-ui.test.js · tests/reel-ui.test.js 의 「값을 말하지 않는다」.
//
// ★★★ 2026-09-16 밤 사장님 지시 — **고른 것이 여기 다 보여야 한다.**
//   그전에는 셋(비율·길이·화풍)만 그렸는데, 만들기 화면에서 고르는 것은 **여덟**이다
//   (비율·길이·화질·모델·화풍·컨셉·분위기·나레이션 언어). 나머지를 안 그리니 "내가 뭘로
//   시켰더라"를 화면에서 확인할 길이 없었다.
//   ★ 고칠 수 있는 축은 **다섯**이다 — 설정 라우트가 받는 것이 그 다섯이고(aspect_ratio·
//     target_seconds·style·i2v_model·resolution), 잠금 표(lockedAxes)도 그 다섯이다.
//   ★ 나머지 셋(컨셉·분위기·나레이션 언어)은 **보여 주기만** 한다 — 라우트가 안 받는다.
//     고를 수 있게 두면 눌러도 아무 일이 없거나 400 이라 거짓말이 된다.
import { useState } from "react";
import { useReelProject } from "../ReelProjectContext";
import { useMe } from "../MeContext";
import { lockedAxes } from "../../lib/reel/locks.js";
import { ASPECTS } from "../../lib/aspects.js";
import { STYLE_PRESETS } from "../../lib/styles.js";
import { secondsForModel, reelModelsForTier, resolutionsForModel, i2vModelLabelOf } from "../../lib/clip-limits.js";
import { REEL_CONCEPTS } from "../../lib/reel/concepts.js";
import { AD_MOODS, AD_LANGS } from "../../lib/ad/options.js";

// ★★★ 표에 없는 저장값도 보여 준다 — 잠긴 축에서 값이 사라지면 무엇으로 만들었는지가
//   화면에서 지워진다(옛 문서에 실재).
//
// 실재의 근거: app/api/reel/[id]/settings/route.js 의 Ruling 9 주석 —
// *"08-25 이전 reel 문서에는 길이가 모델 상한 위이거나 아예 없는 것이 있다."*
// 지금 secondsForModel("seedance-2.0") 은 [15] 하나라, 30초로 만든 옛 문서는 어떤 칩도
// 골라진 상태가 아니게 된다 — 회색 「15초」 칸 하나만 서고 **15초짜리처럼 읽힌다.**
// 같은 구멍이 표에서 사라진 옛 화풍·비율에도 난다.
//
// ⚠️ 그 칩은 **누를 수 없다.** 서버가 어차피 400 이라(목록 밖 값), 고를 수 있게 두면
//   거짓말이 된다. 보여 주기만 하고 고르기는 막는 것이 이 칩의 전부다.
// ★ 라벨은 표에 없으니 **저장값 자체**로 만든다(fmt) — "30초" · "3:2" · 모르는 화풍 id.
// ★ 값이 아예 없으면(undefined·null·"") 붙이지 않는다 — 없는 값을 지어내지 않는다.
export function withSavedValue(items, value, fmt) {
  if (value === undefined || value === null || value === "") return items;
  if (items.some((it) => it.id === value)) return items;
  return [...items, { id: value, text: fmt(value), off: true }];
}

// 표에서 라벨을 찾되, 모르는 값이면 저장값 자체를 보여 준다 — 값을 지어내지도, 지우지도 않는다.
function labelIn(table, id) {
  if (id === undefined || id === null || id === "") return "";
  return table.find((x) => x.id === id)?.label || String(id);
}

export default function SettingsPanel() {
  const { project, reload } = useReelProject();
  // ★★ 모델 칩 목록은 **등급이 가른다**(만들기 화면과 같은 방식 — reelModelsForTier).
  //   등급을 모르는 동안(ready === false)에는 목록을 비운다 — 모르는 등급을 기본 등급으로
  //   떨어뜨리면 프로 사장님에게 기본 모델 하나만 보인다(app/reel/new/page.js 에서 실제로
  //   밟았던 자리다). 그 동안에도 **저장된 모델**은 withSavedValue 가 칩으로 세운다.
  const { me, ready } = useMe();
  const [busy, setBusy] = useState(false);
  // 서버가 거절한 이유를 담는다. 라우트는 409(잠김)·400(값)·403(등급)으로 답하는데,
  // 삼키면 사장님은 **칩이 안 바뀌는 이유**를 영영 모른다.
  const [error, setError] = useState("");
  if (!project) return null;

  const s = project.settings || {};
  const locks = lockedAxes(project);

  // ★★ 길이 칸은 **저장된 모델**이 정한다(lib/clip-limits.js 의 secondsForModel).
  //   TARGET_CHOICES(15·30·45·60)를 그대로 그리면 seedance-2.0 프로젝트에 30·45·60 칸이
  //   서는데, 눌러 봐야 설정 라우트가 400 으로 막는다 — 화면과 서버가 같은 표를 봐야 한다.
  //
  // ★ 세 축 모두 withSavedValue 를 지난다 — 표 밖의 저장값은 **비활성 칩**으로 남는다.
  const fields = [
    {
      axis: "aspect_ratio", label: "비율", value: s.aspect_ratio,
      items: withSavedValue(ASPECTS.map((a) => ({ id: a.id, text: `${a.label} ${a.id}` })), s.aspect_ratio, (v) => String(v)),
    },
    {
      axis: "target_seconds", label: "길이", value: s.target_seconds,
      items: withSavedValue(secondsForModel(s.i2v_model).map((n) => ({ id: n, text: `${n}초` })), s.target_seconds, (v) => `${v}초`),
    },
    {
      axis: "style", label: "화풍", value: s.style,
      items: withSavedValue(STYLE_PRESETS.map((p) => ({ id: p.id, text: p.label })), s.style, (v) => String(v)),
    },
    {
      axis: "i2v_model", label: "모델", value: s.i2v_model,
      items: withSavedValue(
        (ready ? reelModelsForTier(me?.tier, { admin: me?.isAdmin === true }) : []).map((m) => ({ id: m.id, text: m.label })),
        s.i2v_model, (v) => i2vModelLabelOf(v) || String(v),
      ),
    },
    {
      // ★ 화질 칸은 **저장된 모델**이 정한다 — 길이 칸과 같은 이유다(화면과 서버가 같은 표를 본다).
      axis: "resolution", label: "화질", value: s.resolution,
      items: withSavedValue(resolutionsForModel(s.i2v_model).map((r) => ({ id: r, text: r })), s.resolution, (v) => String(v)),
    },
  ];

  // ★ 라우트가 안 받는 축들 — **보여 주기만** 한다. 값이 없으면 줄 자체를 안 그린다
  //   (없는 값을 "기본값"으로 지어내 보여 주면, 고른 적 없는 것을 고른 것처럼 읽힌다).
  const shown = [
    { label: "컨셉", text: labelIn(REEL_CONCEPTS, s.concept) },
    { label: "분위기", text: labelIn(AD_MOODS, s.mood) },
    { label: "나레이션", text: labelIn(AD_LANGS, s.narration_lang) },
  ].filter((x) => x.text);

  // ★★ 잠긴 이유는 **한 번만** 말한다. 비율·길이·모델·화질은 전부 같은 문구
  //   ("시나리오를 확정해서 잠겼어요")를 쓰므로, 축마다 그 줄을 그리면 같은 말이 줄줄이 선다.
  //   중복을 걷어 내고 아래에 모아 둔다 — 화풍만 사유가 다르다(「첫 그림」).
  const reasons = [...new Set(fields.filter((f) => locks[f.axis].locked).map((f) => locks[f.axis].reason))];

  async function change(axis, value) {
    if (locks[axis].locked || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/reel/${project.id}/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        // ★★★ **고친 축 하나만** 싣는다. 잠긴 축은 값이 같아도 409 라서, 설정을 통째로
        //   보내면 확정 뒤에는 어떤 칩을 눌러도 거절당한다.
        body: JSON.stringify({ [axis]: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "지금은 바꾸지 못했어요");
        return;
      }
      await reload(project.id);
    } catch (e) {
      // 문이 안 열린 것도 사장님에게는 "안 바뀐 것"이다 — 말해 준다.
      setError(e?.message || "지금은 바꾸지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  // ★ 부품이 아니라 **함수**다. 그리는 함수를 컴포넌트로 만들어 JSX 안에 두면 렌더마다
  //   새 타입이 되어 React 가 칩을 통째로 다시 심는다(누르는 중 포커스가 날아간다).
  const field = ({ axis, label, value, items }) => (
    <div key={axis} className={`rp-field${locks[axis].locked ? " is-locked" : ""}`}>
      <div className="rp-lab">
        {label}
        {locks[axis].locked && <span className="rp-lockmark">잠김</span>}
      </div>
      <div className="rp-chips">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`rp-chip${it.id === value ? " on" : ""}`}
            // ★ `it.off` 는 표 밖의 저장값이다 — 골라진 것으로 보이되 **늘 못 누른다**.
            disabled={locks[axis].locked || busy || it.off}
            onClick={() => change(axis, it.id)}
          >
            {it.text}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <aside className="rp-panel">
      <div className="rp-head">이 영상의 설정</div>
      <div className="rp-body">
        {fields.map(field)}
        {/* ★ 못 고치는 값도 **같은 모양**으로 선다 — 다른 모양을 주면 새 CSS 가 필요하고,
            그러면 같은 줄을 그리는 자리가 둘이 된다. 칩은 늘 비활성이다(고를 수 없다). */}
        {shown.map((x) => (
          <div key={x.label} className="rp-field">
            <div className="rp-lab">{x.label}</div>
            <div className="rp-chips">
              <button type="button" className="rp-chip on" disabled>{x.text}</button>
            </div>
          </div>
        ))}
        {reasons.length > 0 && (
          <p className="rp-why">{reasons.join(" · ")}</p>
        )}
        {error && <p className="rp-err">{error}</p>}
      </div>
    </aside>
  );
}
