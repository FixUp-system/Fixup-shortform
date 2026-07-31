import { regenCut } from "../../../../../../../lib/pipeline";
import { withUser } from "../../../../../../../lib/auth/require-user.js";

export const POST = withUser(async (req, { params }, user) => {
  const { id, idx } = await params;
  const { instruction } = await req.json().catch(() => ({}));
  try {
    const cut = await regenCut(id, user.id, Number(idx), undefined, instruction);
    return Response.json({ cut });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
});
