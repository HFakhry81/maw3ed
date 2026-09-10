const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of ["index.html", "styles.css", "app.js"]) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}
for (const directory of ["attached_assets", "assets"]) {
  const source = path.join(root, directory);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(dist, directory), { recursive: true });
}
fs.writeFileSync(path.join(dist, "build-manifest.json"), `${JSON.stringify({
  name: "Maw3ed",
  company: "UpNexa-eg.com",
  builtAt: new Date().toISOString(),
  files: ["index.html", "styles.css", "app.js"]
}, null, 2)}\n`);
console.log("Web dist built in ./dist");