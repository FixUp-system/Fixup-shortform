"use client";

// ② 구성 — 영상이 어떤 장면으로 어떻게 흘러갈지. 사장님이 승인하는 첫 게이트.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import BackButton from "../../../../components/BackButton";
import { currentStepKey } from "../../../../lib/steps";

export default function SynopsisStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [instruction, setInstruction] = useState("");
  // 자동 생성이 한 번만 돌게 막는다 — busy는 비동기라 effect가 두 번 불리면 과금이 두 배가 된다.
  const autoGenFor = useRef(null);

  // 지금 있어야 할 단계가 ②구성이고, 아직 대본도 없을 때만 자동으로 만든다 —
  // 단계 판정은 lib/steps 하나만 본다.
  // 구성 도입 전에 만들어진 프로젝트(구성은 없는데 대본이나 컷이 이미 있는)에서는 자동 생성이 돌면 안 된다:
  // 생성이 방문만으로 나가고, 새 구성이 지금 대본과 어긋나며, 상태가 되돌아가 이미 만든 이미지에서 쫓겨난다.
  useEffect(() => {
    if (project && currentStepKey(project) === "synopsis" && !project.script && autoGenFor.current !== id) {
      autoGenFor.current = id;
      gen();
    }
  }, [project?.status, project?.briefing?.confirmed, id]);

  async function gen(instr) {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/synopsis`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(instr ? { instruction: instr } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "구성 만들기 실패");
    await load(id).catch(() => {});
    setBusy(false); setInstruction("");
  }

  // 고친 글이 저장되지 않았는데 저장된 것처럼 보이면 안 된다 — 실패는 그대로 알린다
  async function editScene(idx, field, value) {
    setErr("");
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ synopsis_scene: { idx, [field]: value } }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setErr(data.error || "고친 글을 저장하지 못했어요 — 다시 고쳐 주세요");
    }
    await load(id).catch(() => {});
  }

  // 이미 만들어 둔 이미지가 있는가 — 구성을 새로 짜면 대본부터 다시 가야 해서 그 이미지는 사라진다
  const madeCuts = (project.cuts || []).length > 0;
  // 구성 없이 이미 대본(또는 이미지)까지 간 옛 영상인가 — 자동 생성이 돌지 않는 경우와 정확히 같다
  const madeWithoutSynopsis = !project.synopsis && (currentStepKey(project) !== "synopsis" || !!project.script);

  if (!project.synopsis) {
    if (err) {
      return (
        <p className="pgsub" style={{ color: "var(--warn)" }}>
          {err} <button className="mini" disabled={busy} onClick={() => gen()}>다시 만들기</button>
        </p>
      );
    }
    // 자동 생성이 돌지 않는 경우(=구성 없이 이미 대본이나 이미지까지 간 옛 영상) 화면이 빈 채로 멎지 않게,
    // 지금 무엇을 할 수 있고 무엇을 잃게 되는지 알린 다음 사장님이 직접 시작하게 한다.
    if (madeWithoutSynopsis) {
      return (
        <section className="panel" style={{ maxWidth: 760 }}>
          <h2>이 영상은 구성 없이 만들어졌어요</h2>
          <p className="pgsub">
            구성을 짜는 단계가 생기기 전에 시작한 영상이라, 구성 없이 대본{madeCuts ? "과 이미지가" : "이"} 이미 나와 있어요.
          </p>
          {project.script && (
            <div className="script-src" style={{ color: "var(--warn)" }}>
              구성을 새로 짜면 지금 대본과 어긋날 수 있어요 — 그때는 대본도 다시 써야 해요
            </div>
          )}
          {madeCuts && (
            <div className="script-src" style={{ color: "var(--warn)" }}>
              이미 만들어 둔 이미지가 {project.cuts.length}장 있어요 — 지금 구성을 새로 짜면
              대본부터 다시 가게 되고, 그 이미지는 지워져요
            </div>
          )}
          <div className="script-src">
            {madeCuts
              ? "지금 만든 것을 그대로 두려면 이 화면을 떠나 이미지 단계로 가시면 돼요."
              : "다음 단계로 가려면 구성이 필요해요 — 아래에서 짜 주세요."}
          </div>
          <div className="step-actions">
            <BackButton stepKey="synopsis" />
            <div className="fwd">
              <button className="mini" disabled={busy} onClick={() => gen()}>구성 짜기</button>
            </div>
          </div>
        </section>
      );
    }
    return <p className="pgsub">구성을 짜는 중…</p>;
  }

  const { angle, scenes } = project.synopsis;
  const total = scenes.reduce((a, s) => a + s.seconds, 0);
  // 브리핑을 고쳐 다시 확정하면 버전이 오른다 — 지금 구성이 그 이전 것인지 알려주기만 한다
  const stale =
    project.briefing?.version && project.synopsis.briefing_version &&
    project.synopsis.briefing_version !== project.briefing.version;

  return (
    <section className="panel" style={{ maxWidth: 760 }}>
      <h2>구성을 확인해 주세요 <span className="badge vlm">승인 게이트 1</span></h2>
      {err && <p className="pgsub" style={{ color: "var(--warn)" }}>{err}</p>}
      {stale && (
        <p className="pgsub" style={{ color: "var(--warn)" }}>
          브리핑이 바뀌었어요 — 지금 구성은 바뀌기 전 내용이에요{" "}
          <button className="mini" disabled={busy} onClick={() => gen()}>구성 다시 만들기</button>
        </p>
      )}
      <div className="script-box">
        <p><b>이 영상이 말하는 한 가지</b><br />{angle}</p>
        {scenes.map((s, i) => (
          <p key={i}>
            <span className="tag">{i + 1}. {s.role} · 약 {s.seconds}초</span><br />
            <b>보여줌</b>{" "}
            <span
              contentEditable suppressContentEditableWarning style={{ outline: "none" }}
              onBlur={(e) => {
                const v = e.currentTarget.textContent.trim();
                if (v && v !== s.shows) editScene(i, "shows", v);
              }}
            >{s.shows}</span><br />
            <b>할 말</b>{" "}
            <span
              contentEditable suppressContentEditableWarning style={{ outline: "none" }}
              onBlur={(e) => {
                const v = e.currentTarget.textContent.trim();
                if (v && v !== s.says) editScene(i, "says", v);
              }}
            >{s.says}</span>
          </p>
        ))}
      </div>
      <div className="script-src">
        {scenes.length}장면 · 약 {total}초 예정 · 글을 클릭하면 바로 고칠 수 있어요
        {" "}(초는 배분 계획이고, 실제 길이는 목소리를 입힐 때 정해져요)
      </div>
      {/* 손으로 고친 글은 여기 그대로 남는다. 이미 써 둔 대본에는 저절로 옮겨가지 않으므로 미리 알린다. */}
      <div className="script-src">
        고친 글은 바로 저장돼요 — 이미 써 둔 대본에 담으려면 다음 단계에서 대본을 다시 쓰면 반영돼요
      </div>
      {madeCuts && (
        <div className="script-src" style={{ color: "var(--warn)" }}>
          이미 만들어 둔 이미지가 있어요 — 구성을 새로 짜면 대본부터 다시 가게 되고, 그 이미지는 지워져요
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "flex-end" }}>
        <textarea
          className="sent-input"
          style={{ flex: 1, minHeight: 96, padding: "13px 15px", fontSize: 14, resize: "vertical", fontFamily: "inherit", lineHeight: 1.55 }}
          placeholder="고치고 싶은 곳을 적어주세요 — 예: 가격 장면을 앞으로"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <button className="mini" disabled={busy || !instruction.trim()} onClick={() => gen(instruction)}>
          이대로 고치기
        </button>
      </div>
      <div className="step-actions">
        <BackButton stepKey="synopsis" />
        <div className="fwd">
          <button className="mini" disabled={busy} onClick={() => gen()}>처음부터 다시</button>
          <button className="cta" disabled={busy} onClick={() => router.push(`/create/${id}/script`)}>
            이 구성으로 대본 쓰기 →
          </button>
        </div>
      </div>
    </section>
  );
}
