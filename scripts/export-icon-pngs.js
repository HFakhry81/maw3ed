#!/usr/bin/env node
/**
 * Export Maw3ed platform icon to standard PNG sizes:
 * 16 / 32 (favicon & UI), 48 (Windows), 192 (Android / PWA), 512 (app store / splash)
 */
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const root = path.resolve(__dirname, "..");
const svgPath = path.join(root, "assets", "maw3ed-icon.svg");
const outDir = path.join(root, "assets", "icons");
const sizes = [16, 32, 48, 192, 512];

fs.mkdirSync(outDir, { recursive: true });
const svg = fs.readFileSync(svgPath);

for (const size of sizes) {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  const png = resvg.render().asPng();
  const file = path.join(outDir, `maw3ed-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`${path.relative(root, file)} (${png.length} bytes)`);
}
