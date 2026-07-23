// GET /api/costs — 비용 기록 목록
import { listRecords } from "../../../lib/costs";

export async function GET() {
  const records = await listRecords();
  return Response.json({ records });
}
