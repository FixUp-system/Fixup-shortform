"use client";

// ① 자료 — 사장님이 적은 설명과 사진을 **보여 주기만** 한다. 되묻지도, 다시 받지도 않는다.
//
// 되묻던 자리를 걷어낸 이유: 이제 ②시나리오가 자료를 읽어 주제·갈래·컷을 직접 내놓고,
// 사장님은 그 결과를 눈으로 보며 고친다. 빈칸을 미리 캐물어 봐야 무엇이 부족한지는
// 시나리오를 만들어 봐야 알 수 있었고, 그 전에 멈춰 세우는 것은 게이트만 하나 늘리는 일이었다.
//
// ★★ 그리고 **규격도 여기서 안 받는다**(2026-08-18, 사용자 지시). 길이·사이즈·모델·화질·
//    컨셉·공통 지시는 전부 첫 화면(app/create/page.js)에서 한 번에 받는다. 여기 있던 칩과
//    칸들은 첫 화면에서 이미 받은 것을 **두 번 묻는 자리**였다 — 사장님은 같은 것을 두 번
//    정하고, 두 자리가 어긋나면 어느 쪽이 진짜인지 알 수 없었다.
//
//    ⚠️ 대가를 적어 둔다: **시작한 뒤에는 사이즈·화질·컨셉·공통 지시를 바꿀 수 없다.**
//       바꿀 자리를 다시 열려면 낡음 경고도 함께 돌아와야 한다 — 그 값들은 전 컷의 각인에
//       들어가므로(lib/steps.js), 경고 없이 열면 이미 산 그림·클립이 조용히 낡는다
//       (컷당 $0.08 에 Seedance 30초 한 편이 ~$9다). 지웠던 그 경고가 무엇이었는지는
//       tests/staleness-ui.test.js·tests/prompt-editing-ui.test.js 주석에 남겨 뒀다.
//
// 그래서 이 화면은 상태가 하나다 — 적은 것을 확인하고 ②로 간다.
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";

export default function BriefingStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project } = useProject();

  if (!project) return <p className="pgsub">준비 중…</p>;

  const photos = project.material?.photos || [];

  return (
    <section className="panel panel--narrow">
      <h2>자료는 준비됐어요</h2>
      {/* 적은 글을 통째로 보여 준다 — 이제 이 글 하나가 시나리오의 유일한 원천이다 */}
      <p className="script-src">{project.material?.text}</p>
      {photos.length > 0 && (
        <p className="pgsub">사진 {photos.length}장을 함께 씁니다</p>
      )}
      <div className="step-actions">
        <div className="fwd">
          <button className="cta" onClick={() => router.push(`/create/${id}/scenario`)}>
            시나리오 만들기 →
          </button>
        </div>
      </div>
    </section>
  );
}
