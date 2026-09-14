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
// ★★★ 이번 패널이 그리는 축은 **셋**이다(비율·길이·화풍). 모델·화질은 범위 밖이라
//   여기서 안 그린다 — 잠금 표(lockedAxes)에는 다섯이 다 있지만, 그린 축만 사유를 말한다.
import { useState } from "react";
import { useReelProject } from "../ReelProjectContext";
import { lockedAxes } from "../../lib/reel/locks.js";
import { ASPECTS } from "../../lib/aspects.js";
import { STYLE_PRESETS } from "../../lib/styles.js";
import { secondsForModel } from "../../lib/clip-limits.js";

export default function SettingsPanel() {
  const { project, reload } = useReelProject();
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
  const fields = [
    { axis: "aspect_ratio", label: "비율", value: s.aspect_ratio, items: ASPECTS.map((a) => ({ id: a.id, text: `${a.label} ${a.id}` })) },
    { axis: "target_seconds", label: "길이", value: s.target_seconds, items: secondsForModel(s.i2v_model).map((n) => ({ id: n, text: `${n}초` })) },
    { axis: "style", label: "화풍", value: s.style, items: STYLE_PRESETS.map((p) => ({ id: p.id, text: p.label })) },
  ];

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
            disabled={locks[axis].locked || busy}
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
        {reasons.length > 0 && (
          <p className="rp-why">{reasons.join(" · ")}</p>
        )}
        {error && <p className="rp-err">{error}</p>}
      </div>
    </aside>
  );
}
