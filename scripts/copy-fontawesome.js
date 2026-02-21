"use strict";

/**
 * Copia Font Awesome de node_modules para ui/vendor/fontawesome (uso offline).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "node_modules", "@fortawesome", "fontawesome-free");
const dest = path.join(root, "ui", "vendor", "fontawesome");

function copyRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, name);
    const destPath = path.join(destDir, name);
    if (fs.statSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(src)) {
  ["css", "webfonts"].forEach((dir) => {
    const s = path.join(src, dir);
    const d = path.join(dest, dir);
    if (fs.existsSync(s)) copyRecursive(s, d);
  });
  console.log("Font Awesome copiado para ui/vendor/fontawesome");
} else {
  console.warn("Font Awesome não encontrado em node_modules; execute npm install.");
}
