// Builds a single-page browser test version of the app from the real assets:
//   node demo/build-demo.mjs [out.html]
// The page runs app.js unchanged except that the Firebase imports are replaced by the
// in-browser demo backend (backend.js), plus a test panel (bench.html/bench.js).
import { readFileSync, writeFileSync } from "fs";

const here = p => new URL(p, import.meta.url);
const read = p => readFileSync(here(p), "utf8");
const out = process.argv[2] || new URL("toxic-gaming-demo.html", import.meta.url).pathname;

const html = read("../app/src/main/assets/index.html");
const app = read("../app/src/main/assets/app.js");

const css = html.match(/<style>([\s\S]*?)<\/style>/)[1]
  .replace("position:sticky;top:0;", "position:sticky;top:env(safe-area-inset-top,0px);");
const body = html.match(/<body>([\s\S]*?)<script type="module"/)[1]
  .replace('<p class="muted">Use an account created by the shop owner.</p>',
    '<p class="muted">Test accounts: owner@demo.shop, amy@demo.shop, ben@demo.shop. Password: demo.</p>');

const imports = [...app.matchAll(/^import \{([^}]+)\} from "[^"]+";$/gm)].flatMap(m => m[1].split(",").map(s => s.trim()));
if (imports.length < 10) throw new Error("Could not find the Firebase imports in app.js");
const appCode = app.replace(/^import .*$/gm, "").replace('apiKey: "REPLACE_WITH_FIREBASE_API_KEY"', 'apiKey: "demo"');
if (appCode.includes('apiKey: "REPLACE_')) throw new Error("apiKey placeholder not found");

const page = `<title>Toxic Gaming Test Drive</title>
<style>${css}</style>
${read("bench.html")}
${body}
<script type="module">
${read("backend.js")}
const { ${imports.join(", ")} } = FB;
${appCode}
${read("bench.js")}
</script>
`;
writeFileSync(out, page);
console.log(`Wrote ${out} (${(page.length / 1024).toFixed(1)} KB)`);
