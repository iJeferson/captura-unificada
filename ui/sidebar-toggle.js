"use strict";

function aplicarTema(theme) {
  document.body.classList.toggle("light", theme === "light");
}

aplicarTema("dark");

if (window.api && typeof window.api.onSidebarToggleTheme === "function") {
  window.api.onSidebarToggleTheme(aplicarTema);
}

document.getElementById("expand-sidebar")?.addEventListener("click", () => {
  window.api?.requestSidebarExpand?.();
});
