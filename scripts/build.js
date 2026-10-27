const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
execFileSync(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "build"], {
  cwd: root,
  stdio: "inherit"
});

for (const file of ["auth.html", "auth.js", "plans.html", "plans.js", "admin.html", "admin.js", "book.html", "manage.html", "pass.html", "manifest.webmanifest", "sw.js"]) {
  const sourceFile = path.join(root, file);
  if (fs.existsSync(sourceFile)) fs.copyFileSync(sourceFile, path.join(dist, file));
}
for (const directory of ["assets"]) {
  const source = path.join(root, directory);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(dist, directory), { recursive: true });
}
fs.writeFileSync(path.join(dist, "build-manifest.json"), `${JSON.stringify({
  name: "Maw3ed",
  company: "UpNexa-eg.com",
  builtAt: new Date().toISOString(),
  files: ["index.html", "book.html", "manifest.webmanifest", "sw.js", "assets"]
}, null, 2)}\n`);
console.log("Web dist built in ./dist");