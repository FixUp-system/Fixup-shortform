// 모든 테스트를 임시 폴더에 가둔다.
//
// 왜 필요한가: 비용 기록·프로젝트 저장은 SHOTFORM_DATA_DIR 을 안 주면 저장소의 data/ 에 쓴다.
// 테스트가 fetch 를 mock 해 호출부를 돌리면 그 기록이 **실제 비용 기록에 섞인다** —
// 실제로 그렇게 오염됐다(테스트 16건이 data/costs.json 에 0원짜리로 쌓였다).
// 그러면 fal 대시보드와 대조할 수 없고, 예산 가드도 없는 지출을 세게 된다.
//
// 파일마다 DATA_DIR 을 세우는 방식은 새 테스트가 생길 때마다 빠뜨릴 수 있어 여기서 한 번에 막는다.
// 개별 테스트가 자기 폴더를 따로 잡는 것은 그대로 둔다(그쪽이 더 좁은 격리다).
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-test-"));
