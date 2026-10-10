// POST /api/auth/deconnexion : supprime le cookie de session.
import { cookieEfface } from "../../../lib/auth.js";

export async function onRequestPost() {
  return Response.json({ ok: true }, { headers: { "set-cookie": cookieEfface, "cache-control": "no-store" } });
}
