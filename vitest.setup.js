// 모든 테스트를 인메모리 저장소에 가둔다.
//
// 왜 필요한가: 비용 기록·프로젝트 저장은 실제 저장소로 나간다. 테스트가 fetch 를 mock 해
// 호출부를 돌리면 그 기록이 **실제 비용 기록에 섞인다** — 예전에 실제로 그렇게 오염됐다
// (테스트 16건이 data/costs.json 에 0원짜리로 쌓였다). 이제는 Supabase 를 오염시킨다.
//
// 파일마다 세우는 방식은 새 테스트가 생길 때마다 빠뜨릴 수 있어 여기서 한 번에 막는다.
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

process.env.SHOTFORM_STORE = "memory";

// 아직 파일로 남아 있는 것들(비용 원장 lib/costs.js·렌더 산출물 lib/compose.js)은
// store 를 거치지 않으므로 임시 폴더로 계속 가둔다. 실제로 이 줄을 빼고 전체 테스트를
// 한 번 돌렸더니 data/costs.json 에 0원짜리 15건이 다시 쌓였다 — 예전과 똑같은 오염이다.
// 비용 원장이 store 로 옮겨가면(다음 태스크) 이 줄은 지운다.
process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-test-"));

// 클립 모델 env 는 테스트에서 지운다 — .env.local 을 Kling 으로 바꿔 두면 눈금 기대값이
// 머신마다 달라진다. 활성 프로필을 재는 테스트는 자기 안에서 직접 세운다.
delete process.env.FAL_I2V_ENDPOINT;
