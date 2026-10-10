// GET /api/inscriptions : liste des inscrits pour la page /inscriptions, réservée à l'équipe connectée.
// DELETE /api/inscriptions {id} ou {session} : supprime une inscription, ou toutes celles d'un parcours (tests, demandes RGPD).
import { base, placesRestantes, sessions } from "../../lib/alpha.js";
import { membreConnecte } from "../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const headers = { "cache-control": "no-store" };
  const email = await membreConnecte(request, env);
  if (!email) return Response.json({ ok: false, error: "Connexion requise." }, { status: 401, headers });
  if (!env.DB) return Response.json({ ok: false, error: "Base des inscriptions non liée." }, { status: 503, headers });

  const db = await base(env.DB);
  const { results } = await db.prepare("SELECT id, session, first_name, last_name, email, phone, address, message, created_at FROM inscriptions ORDER BY session, created_at").all();
  const restantes = await placesRestantes(env.DB);
  return Response.json({
    ok: true,
    membre: email,
    sessions: sessions().map((s) => ({ id: s.id, label: s.label, capacity: Number(s.capacity) || 0, open: s.open !== false, restantes: restantes[s.id] ?? null })),
    inscrits: results,
  }, { headers });
}

export async function onRequestDelete({ request, env }) {
  const headers = { "cache-control": "no-store" };
  const rep = (corps, status = 200) => Response.json(corps, { status, headers });
  if (!(await membreConnecte(request, env))) return rep({ ok: false, error: "Connexion requise." }, 401);
  if (!env.DB) return rep({ ok: false, error: "Base des inscriptions non liée." }, 503);
  // JSON uniquement : un autre site ne peut pas déclencher une suppression depuis un formulaire.
  if (!(request.headers.get("content-type") || "").includes("application/json")) return rep({ ok: false, error: "Requête illisible." }, 400);
  let corps;
  try {
    corps = await request.json();
  } catch {
    return rep({ ok: false, error: "Requête illisible." }, 400);
  }
  const db = await base(env.DB);
  if (Number.isInteger(corps.id)) {
    const { meta } = await db.prepare("DELETE FROM inscriptions WHERE id = ?").bind(corps.id).run();
    return rep({ ok: true, supprimes: meta.changes });
  }
  if (typeof corps.session === "string" && corps.session) {
    const { meta } = await db.prepare("DELETE FROM inscriptions WHERE session = ?").bind(corps.session).run();
    return rep({ ok: true, supprimes: meta.changes });
  }
  return rep({ ok: false, error: "Précisez l’inscription ou le parcours à supprimer." }, 400);
}
