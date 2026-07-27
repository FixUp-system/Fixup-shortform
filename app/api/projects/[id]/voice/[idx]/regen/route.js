import { regenVoice } from "../../../../../../../lib/pipeline";

export async function POST(req, { params }) {
  const { id, idx } = await params;
  try {
    const cut = await regenVoice(id, Number(idx));
    return Response.json({ cut });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
