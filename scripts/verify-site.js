const fs = require("fs");
const path = require("path");

const required = [
  "index.html",
  "about/index.html",
  "forms/index.html",
  "styles.css",
  "script.js",
  "supabase-client.js",
  "vercel.json",
  ".vercel/project.json"
];

for (const file of required) {
  const fullPath = path.join(process.cwd(), file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required site file: ${file}`);
  }
}

console.log("Shield Protection Australia site files verified.");
