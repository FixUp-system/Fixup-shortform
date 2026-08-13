"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadProjects } from "../../lib/projects-client";
import ProjectCards from "../../components/ProjectCards";

export default function Archive() {
  const [projects, setProjects] = useState(null); // null = 불러오는 중
  const [err, setErr] = useState("");

  // 정리는 몰아서 하는 일이다 — 하나씩 지우면 스무 편을 치우는 데 스무 번을 묻는다.
  // 평소에는 카드가 프로젝트로 들어가는 문이고, [수정] 을 누른 동안에만 고르는 자리가 된다.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadProjects().then(({ projects, err }) => {
      setProjects(projects);
      setErr(err);
    });
  }, []);

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  // 고른 것을 지운다.
  //
  // ★ 한 번만 묻는다 — 스무 편을 고르고 스무 번 확인하면 [수정] 을 만든 뜻이 없다.
  // ★ 한 건씩 순서대로 보낸다. 한꺼번에 던지면 실패한 것이 무엇인지 흐려지고, 지우기는
  //   완성본 파일까지 함께 지우는 일이라 서버에 한 번에 몰 이유가 없다.
  // ★ 성공한 것만 목록에서 뺀다 — 실패한 카드는 남아 있어야 다시 시도할 수 있다.
  async function removeSelected() {
    if (!selected.size || busy) return;
    if (!confirm(
      `${selected.size}편을 지울까요?\n\n만든 영상과 그림이 함께 지워지고 되돌릴 수 없어요. 쓴 크레딧은 돌아오지 않아요.`
    )) return;

    setBusy(true);
    setErr("");
    const gone = [];
    const failed = [];
    for (const id of selected) {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      (res.ok ? gone : failed).push(id);
    }
    setProjects((list) => list.filter((p) => !gone.includes(p.id)));
    setBusy(false);

    if (failed.length) {
      setErr(`${failed.length}편을 지우지 못했어요 — 다시 시도해 주세요.`);
      setSelected(new Set(failed));
      return;
    }
    stopSelecting();
  }

  const count = projects?.length || 0;

  return (
    <>
      <div className="home-header">
        <h1 className="pgtitle">보관함</h1>
        {selecting ? (
          <div className="chips">
            <button
              className="mini"
              disabled={busy}
              onClick={() =>
                setSelected((s) => (s.size === count ? new Set() : new Set(projects.map((p) => p.id))))
              }
            >
              {selected.size === count && count > 0 ? "선택 해제" : "모두 선택"}
            </button>
            <button className="mini" disabled={busy} onClick={stopSelecting}>
              취소
            </button>
            {/* 아무것도 안 골랐으면 누를 것이 없다 — 빈 확인 대화를 띄우지 않는다 */}
            <button className="mini confirm-btn" disabled={busy || !selected.size} onClick={removeSelected}>
              {busy ? "지우는 중…" : `${selected.size}편 지우기`}
            </button>
          </div>
        ) : (
          <div className="chips">
            {count > 0 && (
              <button className="mini" onClick={() => setSelecting(true)}>
                수정
              </button>
            )}
            <Link href="/create" className="cta">
              + 새 영상 만들기
            </Link>
          </div>
        )}
      </div>
      <p className="pgsub">
        {selecting
          ? "지울 영상을 눌러서 고르세요."
          : "지금까지 만든 영상이 여기 모입니다. 눌러서 이어서 작업할 수 있어요."}
      </p>

      {projects === null && <p className="pgsub">불러오는 중…</p>}
      {err && <p className="pgsub warn">{err}</p>}
      {projects?.length === 0 && !err && (
        <p className="pgsub">아직 만든 영상이 없어요. 새로 만들어 보세요.</p>
      )}
      {projects && projects.length > 0 && (
        <ProjectCards
          projects={projects}
          selecting={selecting}
          selected={selected}
          onToggleSelect={toggle}
          onDeleted={(id) => setProjects((list) => list.filter((p) => p.id !== id))}
        />
      )}
    </>
  );
}
