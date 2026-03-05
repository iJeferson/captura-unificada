"use strict";

/**
 * Copia apenas os arquivos Font Awesome necessários (solid) para ui/vendor/fontawesome.
 * Reduz ~2MB: só solid.min.css + fa-solid-900 (woff2/ttf) em vez de all + brands + regular.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "node_modules", "@fortawesome", "fontawesome-free");
const dest = path.join(root, "ui", "vendor", "fontawesome");

const FILES_TO_COPY = [
  ["css", "fontawesome.min.css"],
  ["css", "solid.min.css"],
  ["webfonts", "fa-solid-900.woff2"],
  ["webfonts", "fa-solid-900.ttf"],
];

if (fs.existsSync(src)) {
  const destCss = path.join(dest, "css");
  const destWebfonts = path.join(dest, "webfonts");
  fs.mkdirSync(destCss, { recursive: true });
  fs.mkdirSync(destWebfonts, { recursive: true });

  for (const [dir, file] of FILES_TO_COPY) {
    const srcPath = path.join(src, dir, file);
    const destPath = path.join(dest, dir, file);
    if (fs.existsSync(srcPath)) fs.copyFileSync(srcPath, destPath);
  }

  /* Remove arquivos antigos (all, brands, regular, v4, v5, svg-with-js) */
  for (const d of [destCss, destWebfonts]) {
    if (!fs.existsSync(d)) continue;
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const keep = FILES_TO_COPY.some(([dir, file]) => path.join(dest, dir, file) === full);
      if (!keep) {
        try {
          fs.unlinkSync(full);
        } catch (_) {}
      }
    }
  }
  console.log("Font Awesome (solid) copiado para ui/vendor/fontawesome");
} else {
  console.warn("Font Awesome não encontrado em node_modules; execute npm install.");
}
