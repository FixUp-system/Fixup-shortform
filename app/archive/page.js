"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loadProjects } from "../../lib/projects-client";
import ProjectCards from "../../components/ProjectCards";
import { useDialog } from "../../components/DialogProvider";

function ArchiveBody() {
  const [projects, setProjects] = useState(null); // null = 불러오는 중
  const [err, setErr] = useState("");
  // 보는 범위 — "mine"(내 영상) 또는 "all"(전체).
  //
  // ★ 기본은 **내 영상**이다. 내부 팀이라 서로의 결과물을 볼 수 있게 열었지만, 보관함을
  //   열자마자 남의 영상이 쏟아지면 내 것을 찾는 자리가 아니게 된다. 여는 쪽이 한 번
  //   누르는 동작이어야 한다.
  // ★ 첫 탭은 **주소**가 정한다(2026-08-19). 상세에서 [보관함으로]로 돌아올 때 보던 탭이
  //   실려 오므로, 화면 안 상태로만 기억하면 돌아올 때마다 [내 영상]으로 떨어진다.
  const params = useSearchParams();
  // ★ 로그인 없이 보고 있는가. 손님에게는 **"내 영상"이라는 개념이 없다** — 그 칸을
  //   그리면 누를 수 없는 자리를 누른 것처럼 보인다(라우트는 늘 전체로 답한다).
  const [guest, setGuest] = useState(false);
  const [scope, setScope] = useState(() => (params.get("scope") === "all" ? "all" : "mine"));

  // 정리는 몰아서 하는 일이다 — 하나씩 지우면 스무 편을 치우는 데 스무 번을 묻는다.
  // 평소에는 카드가 프로젝트로 들어가는 문이고, [수정] 을 누른 동안에만 고르는 자리가 된다.
  const { confirm } = useDialog();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  // 범위를 바꾸면 다시 불러온다. 늦게 온 앞 요청이 뒤 요청을 덮지 않게 alive 로 막는다 —
  // 두 번 빠르게 누르면 [내 영상]을 보는데 [전체] 결과가 얹히는 일이 생긴다.
  useEffect(() => {
    let alive = true;
    setProjects(null);
    setErr("");
    loadProjects(fetch, scope).then(({ projects, err, guest }) => {
      if (!alive) return;
      setProjects(projects);
      setErr(err);
      // 손님(비로그인)인가 — 라우트가 말해 준다(lib/auth/guest.js). 짐작하지 않는다.
      setGuest(guest);
    });
    return () => {
      alive = false;
    };
  }, [scope]);

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
    const ok = await confirm({
      title: `${selected.size}편을 지울까요?`,
      body: "만든 영상과 그림이 함께 지워지고 되돌릴 수 없어요.\n쓴 크레딧은 돌아오지 않아요.",
      confirmLabel: "지우기",
    });
    if (!ok) return;

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
  const isAll = scope === "all";

  // 범위를 바꿀 때는 고르던 것을 버린다 — 남긴 채 넘어가면 [전체]에서 고른 남의 카드가
  // 선택에 남아 지우기가 404 로 떨어진다.
  function changeScope(next) {
    if (next === scope) return;
    stopSelecting();
    setScope(next);
  }

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
            {/* 보는 범위 — 내부 팀이라 남이 만든 것도 볼 수 있다(읽기 전용).
                ★ 손님에게는 이 두 칸과 [수정]을 안 그린다(2026-08-27) — 고를 것도 지울
                  것도 없다. 대신 무엇을 보고 있는지 한 줄로 말한다. */}
            {guest ? (
              <span className="hint">로그인 없이 전체 결과물을 보고 있어요 — 보기 전용이에요.</span>
            ) : (
              <>
            <button
              className="mini"
              aria-pressed={!isAll}
              onClick={() => changeScope("mine")}
            >
              내 영상
            </button>
            <button
              className="mini"
              aria-pressed={isAll}
              onClick={() => changeScope("all")}
            >
              전체
            </button>
            {/* 몰아서 지우기는 **내 영상** 자리에서만 연다 — 전체 목록에는 남의 카드가
                섞여 있어 "모두 선택"이 지울 수 없는 것까지 고른다 */}
            {count > 0 && !isAll && (
              <button className="mini" onClick={() => setSelecting(true)}>
                수정
              </button>
            )}
              </>
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
          : isAll
            ? "팀이 만든 영상을 모두 볼 수 있어요. 남이 만든 것은 보기만 됩니다."
            : "지금까지 만든 영상이 여기 모입니다. 눌러서 이어서 작업할 수 있어요."}
      </p>

      {projects === null && <p className="pgsub">불러오는 중…</p>}
      {err && <p className="pgsub warn">{err}</p>}
      {projects?.length === 0 && !err && (
        <p className="pgsub">
          {isAll ? "아직 만들어진 영상이 없어요." : "아직 만든 영상이 없어요. 새로 만들어 보세요."}
        </p>
      )}
      {projects && projects.length > 0 && (
        <ProjectCards
          scope={scope}
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

// ★ useSearchParams 는 Suspense 경계 안에서만 쓸 수 있다(Next App Router).
//   감싸지 않으면 배포 빌드가 이 페이지를 정적으로 굽지 못하고 죽는다.
export default function Archive() {
  return (
    <Suspense fallback={null}>
      <ArchiveBody />
    </Suspense>
  );
}
