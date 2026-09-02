// 실제 비용 표 — **어느 모드에서 무엇이 얼마나 드는가**. 그 조합이 사는 유일한 자리.
//
// ★★★ 2026-09-02 — 그전에는 이 조합이 **app/cost-table/page.js 안에 손으로** 적혀 있었다
//   (ROWS 세 줄). 그 화면의 머리말은 "표를 여기 손으로 적으면 단가가 바뀌는 날 이 화면만
//   낡는다"고 이미 경고하고 있었는데, 정작 조합 자체가 그 상태였다:
//     · **원클릭이 통째로 빠져 있었다** — 단계별(r2v) 세 줄뿐이었다.
//     · 모델을 "Seedance 2.0" 으로 불렀다 — 08-31 에 표에서 등급 이름(기본·프로)으로
//       바꾼 뒤라 화면만 옛 이름을 말했다.
//   그래서 조합을 **각 모드의 원천 표에서 뽑는다**. 화면은 그리기만 한다.
//
// ★★ 두 모드는 **드는 값의 구성이 다르다**:
//   · **단계별** — 스토리보드를 **한 장** 굽는다(컷이 몇 개든 격자 한 장,
//     lib/reel/storyboard.js). 그래서 편당 이미지값이 한 번 붙는다.
//   · **원클릭** — 사장님이 올린 사진을 그대로 넘긴다. lib/ad/ 에는 generateImage 호출이
//     **없다** — 이미지값이 아예 0 이다.
//   이 차이를 안 보여 주면 두 모드의 합계가 같은 규칙으로 읽힌다.
//
// ⚠️ 이 파일은 **순수**하다 — 단가 계산기(estimateCost)를 **인자로 받는다.** 직접 import
//   하지 않는 이유: lib/costs.js 는 store·actor 를 끌어와서, 이 모듈을 테스트나 화면이
//   가볍게 부를 수 없게 된다. 부르는 쪽(서버 컴포넌트)이 자기 것을 넘긴다.
import { AD_MODELS, adEndpoint, adSecondsFor, adResolutionsFor } from "./ad/models.js";
import { REEL_MODEL_IDS, I2V_MODELS, secondsForModel, resolutionsForModel } from "./clip-limits.js";
import { FLOWS } from "./costs-filter.js";

// 스토리보드 한 장. ★ 접두사로 적는다 — 실제 엔드포인트는 openai/gpt-image-2 이고
//   lib/costs.js 의 PRICE_TABLE 이 접두사로 맞춘다("/edit" 변형도 같이 걸린다).
export const IMAGE_ENDPOINT = "openai/gpt-image";
export const IMAGE_QUALITY = "high";

// ★ 모드 이름은 **lib/costs-filter.js 의 FLOWS 하나**에서 온다 — 비용 기록 화면·사이드바와
//   같은 말을 써야 한다. 여기 또 적으면 그 순간 두 벌이 된다.
const flowLabel = (id) => FLOWS.find((f) => f.id === id).label;

// ★ 엔드포인트는 **AD_MODELS 가 정본**이다(모델 id → fal 접두사). 은퇴한 모델도 표에는
//   남아 있어(lib/ad/models.js) 단계별의 2.0 도 여기서 그대로 얻는다.
// ★ 두 모드 다 **r2v** 로 잡는다 — 지금 굽는 경로가 참조 기반이다(단계별은 스토리보드
//   한 장, 원클릭은 올린 사진). 값은 어차피 모델 접두사로 갈리므로 kind 가 값을 바꾸지
//   않지만, 실제로 부르는 경로를 적어 두는 편이 나중에 표를 읽을 때 정직하다.
const endpointOf = (modelId) => adEndpoint(modelId, "r2v");

// 원클릭이 여는 조합 — **은퇴한 모델은 빠진다**(2.0).
function adSpecs() {
  return AD_MODELS.filter((m) => !m.hidden).map((m) => ({
    modelId: m.id,
    label: m.label,
    endpoint: endpointOf(m.id),
    seconds: adSecondsFor(m.id),
    resolutions: adResolutionsFor(m.id),
  }));
}

// 단계별이 여는 조합 — REEL_MODEL_IDS 가 정본이다(2026-09-01 부터 기본이 2.0).
function reelSpecs() {
  return REEL_MODEL_IDS.map((id) => ({
    modelId: id,
    label: I2V_MODELS.find((m) => m.id === id)?.label || id,
    endpoint: endpointOf(id),
    seconds: secondsForModel(id),
    resolutions: resolutionsForModel(id),
  }));
}

function rowsOf(specs, estimate, image) {
  const rows = [];
  for (const s of specs) {
    for (const seconds of s.seconds) {
      for (const resolution of s.resolutions) {
        const video = estimate(s.endpoint, seconds, resolution);
        rows.push({
          modelId: s.modelId,
          label: s.label,
          seconds,
          resolution,
          endpoint: s.endpoint,
          image,
          video,
          total: image + video,
        });
      }
    }
  }
  return rows;
}

// 화면이 그대로 그리는 모양 — 모드 하나가 표 하나다.
export function costTableSections(estimate) {
  const image = estimate(IMAGE_ENDPOINT, 1, IMAGE_QUALITY);
  return [
    { id: "ad", label: flowLabel("ad"), hasImage: false, rows: rowsOf(adSpecs(), estimate, 0) },
    { id: "reel", label: flowLabel("reel"), hasImage: true, rows: rowsOf(reelSpecs(), estimate, image) },
  ];
}
