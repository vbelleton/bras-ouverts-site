// GET /api/export-inscriptions : liste des inscrits en CSV (ouvrable dans Excel).
// Réservé à l'équipe connectée (voir lib/auth.js). Clé de secours facultative : si EXPORT_PASSWORD est défini,
// le navigateur demande un identifiant (au choix) et ce mot de passe.
// ?session=alpha-1 pour un seul parcours.
import { base } from "../../lib/alpha.js";
import { membreConnecte } from "../../lib/auth.js";

const COLS = [["session", "Parcours"], ["first_name", "Prénom"], ["last_name", "Nom"], ["email", "E-mail"], ["phone", "Téléphone"], ["address", "Adresse postale"], ["message", "Message"], ["created_at", "Inscrit le (UTC)"]];

// Comparaison en temps constant, pour ne pas laisser deviner le mot de passe caractère par caractère.
async function egal(a, b) {
  const h = async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function motDePasseValide(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!env.EXPORT_PASSWORD || !auth.startsWith("Basic ")) return false;
  try {
    const pass = new TextDecoder().decode(Uint8Array.from(atob(auth.slice(6)), (c) => c.charCodeAt(0))).split(":").slice(1).join(":");
    return await egal(pass, env.EXPORT_PASSWORD);
  } catch {
    return false;
  }
}

// Point-virgule et BOM UTF-8 : Excel en français ouvre le fichier directement avec les accents.
const cell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = "'" + s; // empêche Excel d'interpréter une valeur comme une formule
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function onRequestGet({ request, env }) {
  if (!env.DB) return new Response("Base des inscriptions non liée.", { status: 503 });
  if (!(await membreConnecte(request, env)) && !(await motDePasseValide(request, env))) {
    return new Response("Connexion requise.", {
      status: 401,
      headers: env.EXPORT_PASSWORD ? { "WWW-Authenticate": 'Basic realm="Inscriptions Bras Ouverts", charset="UTF-8"' } : {},
    });
  }

  const session = new URL(request.url).searchParams.get("session");
  const sql = `SELECT ${COLS.map(([c]) => c).join(", ")} FROM inscriptions ${session ? "WHERE session = ?" : ""} ORDER BY session, created_at`;
  const stmt = (await base(env.DB)).prepare(sql);
  const { results } = await (session ? stmt.bind(session) : stmt).all();
  const csv = "﻿" + [COLS.map(([, l]) => l), ...results.map((r) => COLS.map(([c]) => r[c]))].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="inscriptions-alpha${session ? `-${session}` : ""}.csv"`,
      "cache-control": "no-store",
    },
  });
}
