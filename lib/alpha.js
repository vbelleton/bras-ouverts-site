// Parcours Alpha : les sessions et leur capacité viennent de content/site.json (modifiable dans Pages CMS),
// les inscriptions de la base D1 liée au projet sous le nom DB.
import site from "../content/site.json";

// La table est créée au premier appel : pas de migration à lancer à la main.
// Une même adresse ne s'inscrit qu'une fois par parcours (UNIQUE).
export const SCHEMA = `CREATE TABLE IF NOT EXISTS inscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (session, email)
)`;
// Mémorisé par isolat ; en cas d'échec on réessaiera à la requête suivante.
const prete = new WeakMap();
// Anciennes tables (créées avant l'ajout de l'adresse postale) : on ajoute la colonne, l'erreur « existe déjà » est normale.
const initialiser = async (db) => {
  await db.prepare(SCHEMA).run();
  await db.prepare("ALTER TABLE inscriptions ADD COLUMN address TEXT").run().catch(() => {});
};
export function base(db) {
  if (!prete.has(db)) prete.set(db, initialiser(db).catch((e) => { prete.delete(db); throw e; }));
  return prete.get(db).then(() => db);
}

export function sessions() {
  const bloc = (site.blocks || []).find((b) => b.type === "alpha");
  return (bloc?.sessions || []).filter((s) => s && s.id);
}

// Places restantes par session ouverte ; null pour une session sans limite.
export async function placesRestantes(d1) {
  const db = await base(d1);
  const { results } = await db.prepare("SELECT session, COUNT(*) AS n FROM inscriptions GROUP BY session").all();
  const pris = Object.fromEntries(results.map((r) => [r.session, r.n]));
  return Object.fromEntries(
    sessions().filter((s) => s.open !== false).map((s) => {
      const cap = Number(s.capacity);
      return [s.id, cap > 0 ? Math.max(0, cap - (pris[s.id] || 0)) : null];
    }),
  );
}
