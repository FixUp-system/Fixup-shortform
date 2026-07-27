import { regenClip } from "../../../../../../../lib/pipeline";

export async function POST(req, { params }) {
  const { id, idx } = await params;
  try {
    const cut = await regenClip(id, Number(idx));
    return Response.json({ cut });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
