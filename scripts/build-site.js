const fs = require("fs");
const path = require("path");

require("./verify-site");

const root = process.cwd();
const dist = path.join(root, "dist");
const entries = [
  "index.html",
  "about",
  "admin",
  "forms",
  "assets",
  "styles.css",
  "script.js",
  "supabase-client.js",
  "upload-documents.js"
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const entry of entries) {
  const from = path.join(root, entry);
  const to = path.join(dist, entry);
  fs.cpSync(from, to, { recursive: true });
}

console.log("Built static site to dist.");
