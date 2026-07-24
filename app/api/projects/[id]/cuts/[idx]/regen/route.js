import { regenCut } from "../../../../../../../lib/pipeline";

export async function POST(req, { params }) {
  const { id, idx } = await params;
  const { instruction } = await req.json().catch(() => ({}));
  try {
    const cut = await regenCut(id, Number(idx), undefined, instruction);
    return Response.json({ cut });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
