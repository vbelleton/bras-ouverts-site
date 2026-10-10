// GET /api/places : places restantes par parcours, pour griser ceux qui sont complets.
import { placesRestantes } from "../../lib/alpha.js";

export async function onRequestGet({ env }) {
  if (!env.DB) return Response.json({}, { headers: { "cache-control": "no-store" } });
  return Response.json(await placesRestantes(env.DB), { headers: { "cache-control": "no-store" } });
}
