import { regenClip } from "../../../../../../../lib/pipeline";
import { withUser } from "../../../../../../../lib/auth/require-user.js";

export const POST = withUser(async (req, { params }, user) => {
  const { id, idx } = await params;
  try {
    const cut = await regenClip(id, user.id, Number(idx));
    return Response.json({ cut });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
});
