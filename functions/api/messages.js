// Messages du formulaire de contact, pour l'onglet « Messages » de l'espace équipe.
// GET : la liste. PATCH {id, lu} : marquer lu / non lu. DELETE {id} : supprimer.
// Réservé aux membres connectés ; les écritures n'acceptent que du JSON.
import { base } from "../../lib/alpha.js";
import { membreConnecte } from "../../lib/auth.js";

const headers = { "cache-control": "no-store" };
const rep = (corps, status = 200) => Response.json(corps, { status, headers });

async function garde(request, env) {
  if (!(await membreConnecte(request, env))) return rep({ ok: false, error: "Connexion requise." }, 401);
  if (!env.DB) return rep({ ok: false, error: "Base non liée." }, 503);
  return null;
}

async function corpsJson(request) {
  if (!(request.headers.get("content-type") || "").includes("application/json")) return null;
  try {
    const c = await request.json();
    return Number.isInteger(c?.id) ? c : null;
  } catch {
    return null;
  }
}

export async function onRequestGet({ request, env }) {
  const refus = await garde(request, env);
  if (refus) return refus;
  const db = await base(env.DB);
  const { results } = await db.prepare("SELECT id, first_name, last_name, email, phone, subject, message, lu, created_at FROM messages ORDER BY created_at DESC, id DESC").all();
  return rep({ ok: true, messages: results });
}

export async function onRequestPatch({ request, env }) {
  const refus = await garde(request, env);
  if (refus) return refus;
  const c = await corpsJson(request);
  if (!c) return rep({ ok: false, error: "Requête illisible." }, 400);
  const { meta } = await (await base(env.DB)).prepare("UPDATE messages SET lu = ? WHERE id = ?").bind(c.lu ? 1 : 0, c.id).run();
  return rep({ ok: true, modifies: meta.changes });
}

export async function onRequestDelete({ request, env }) {
  const refus = await garde(request, env);
  if (refus) return refus;
  const c = await corpsJson(request);
  if (!c) return rep({ ok: false, error: "Requête illisible." }, 400);
  const { meta } = await (await base(env.DB)).prepare("DELETE FROM messages WHERE id = ?").bind(c.id).run();
  return rep({ ok: true, supprimes: meta.changes });
}
