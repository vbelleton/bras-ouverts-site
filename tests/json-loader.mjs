// Permet aux tests d'importer un .json sans « with { type: "json" } », comme le fait le bundler de Cloudflare Pages.
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`
  export function load(url, context, nextLoad) {
    return nextLoad(url, url.endsWith(".json") ? { ...context, importAttributes: { type: "json" } } : context);
  }
`));
