// 실제 비용 — **내부 테스트 단계에서 모든 사용자가 보는 화면**(2026-08-25 사장님 지시).
//
// ★★ 이것은 **크레딧(정가)이 아니라 원가**다. 우리가 fal·OpenAI 에 실제로 내는 돈이다.
//   두 장부가 단위부터 다르다(CLAUDE.md 의 "장부가 둘이고 단위가 다르다") — 여기서
//   크레딧을 함께 보여 주면 그 둘이 섞여 읽힌다. 그래서 이 화면은 **달러와 원화만** 말한다.
//
// ★★ **서버 컴포넌트다**("use client" 가 없다). 값을 lib/costs.js 의 estimateCost 한
//   자리에서 뽑기 때문이다 — 그 파일은 store·actor 를 끌어 화면이 import 할 수 없다.
//   표를 여기 손으로 적으면 단가가 바뀌는 날 이 화면만 낡는다(이 저장소가 "값이 두 벌이면
//   갈린다"로 여러 번 겪은 자리다). app/page.js 가 같은 모양의 선례다.
//
// ★ force-dynamic — 빌드 시점에 미리 굽지 않는다. estimateCost 자체는 순수하지만 그
//   모듈이 끌어오는 사슬(store)이 빌드 환경에서 env 를 요구할 수 있다.
export const dynamic = "force-dynamic";

import { estimateCost } from "../../lib/costs.js";

// ★★ 환율은 **상수 + 기준일**이다(2026-08-25 00:02 UTC · open.er-api.com).
//   런타임에 외부 환율 API 를 부르지 않는 이유: 이 화면 하나 때문에 바깥 서비스에
//   의존성이 생기고, 그 API 가 죽으면 화면이 죽거나 값이 조용히 비어야 한다.
//   내부 테스트용 참고값이라 **언제 기준인지 적는 것**이 정확도보다 중요하다.
const USD_KRW = 1383.12;
const RATE_AT = "2026-08-25";

// 보여 줄 조합 — 각 모델이 실제로 여는 길이·화질만 적는다(lib/clip-limits.js 의
// secondsForModel · resolutionsForModel 이 화면에서 여는 것과 같은 조합이다).
const ROWS = [
  { model: "Seedance 2.0", tier: "기본", ep: "bytedance/seedance-2.0/reference-to-video", seconds: 15, resolutions: ["480p", "720p", "1080p"] },
  { model: "Seedance 2.5", tier: "프로", ep: "bytedance/seedance-2.5/reference-to-video", seconds: 15, resolutions: ["480p", "720p"] },
  { model: "Seedance 2.5", tier: "프로", ep: "bytedance/seedance-2.5/reference-to-video", seconds: 30, resolutions: ["480p", "720p"] },
];

// 스토리보드는 **한 장**이다 — 컷이 몇 개든 격자 한 장에 다 그린다(lib/reel/storyboard.js).
// 그래서 이미지값은 길이·컷 수와 무관하게 편당 한 번이다.
const IMAGE_ENDPOINT = "openai/gpt-image";
const IMAGE_QUALITY = "high";

const usd = (n) => `$${n.toFixed(2)}`;
const krw = (n) => `${Math.round(n * USD_KRW).toLocaleString("ko-KR")}원`;

export default function CostTablePage() {
  const image = estimateCost(IMAGE_ENDPOINT, 1, IMAGE_QUALITY);
  const rows = [];
  for (const r of ROWS) {
    for (const res of r.resolutions) {
      const video = estimateCost(r.ep, r.seconds, res);
      rows.push({ ...r, res, video, total: image + video });
    }
  }

  return (
    <>
      <h1 className="pgtitle">실제 비용</h1>
      <p className="pgsub">
        영상 한 편을 만들 때 실제로 나가는 돈이에요 — 크레딧이 아니라 <b>원가</b>예요.
        지금은 내부 테스트 단계라 모두가 볼 수 있게 열어 두었어요.
      </p>

      <section className="panel panel--wide">
        <h2>한 편 만들 때</h2>
        <p className="pgsub">
          스토리보드는 컷이 몇 개든 <b>한 장</b>이라 값이 한 번만 들어요. 영상은 길이와 화질이 값을 정해요.
        </p>

        <div className="tablewrap">
          <table className="costtable">
            <thead>
              <tr>
                <th>모델</th>
                <th>등급</th>
                <th>길이</th>
                <th>화질</th>
                <th className="num">이미지</th>
                <th className="num">영상</th>
                <th className="num">합계</th>
                <th className="num">원화</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.model}-${r.seconds}-${r.res}`}>
                  <td>{r.model}</td>
                  <td>{r.tier}</td>
                  <td>{r.seconds}초</td>
                  <td>{r.res}</td>
                  <td className="num">{usd(image)}</td>
                  <td className="num">{usd(r.video)}</td>
                  <td className="num"><b>{usd(r.total)}</b></td>
                  <td className="num">{krw(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="pgsub">
          환율 1달러 = {USD_KRW.toLocaleString("ko-KR")}원 ({RATE_AT} 기준). 참고용이라 실제 청구 시점의 환율과 달라요.
        </p>
      </section>

      <section className="panel panel--wide">
        <h2>표에 안 들어간 것</h2>
        <p className="pgsub">
          시나리오를 쓰는 값과 자막 시각을 재는 값은 합쳐도 편당 100원이 안 돼서 뺐어요.
          그림을 다시 만들면 이미지값이 그만큼 또 들어요.
        </p>
      </section>
    </>
  );
}
