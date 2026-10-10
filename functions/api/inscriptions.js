// GET /api/inscriptions : liste des inscrits pour la page /inscriptions, réservée à l'équipe connectée.
import { base, placesRestantes, sessions } from "../../lib/alpha.js";
import { membreConnecte } from "../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const headers = { "cache-control": "no-store" };
  const email = await membreConnecte(request, env);
  if (!email) return Response.json({ ok: false, error: "Connexion requise." }, { status: 401, headers });
  if (!env.DB) return Response.json({ ok: false, error: "Base des inscriptions non liée." }, { status: 503, headers });

  const db = await base(env.DB);
  const { results } = await db.prepare("SELECT session, first_name, last_name, email, phone, address, message, created_at FROM inscriptions ORDER BY session, created_at").all();
  const restantes = await placesRestantes(env.DB);
  return Response.json({
    ok: true,
    membre: email,
    sessions: sessions().map((s) => ({ id: s.id, label: s.label, capacity: Number(s.capacity) || 0, open: s.open !== false, restantes: restantes[s.id] ?? null })),
    inscrits: results,
  }, { headers });
}
