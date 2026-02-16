const btnCaptura = document.getElementById("captura");
const btnSmart = document.getElementById("smart");
const loading = document.getElementById("loading");
const titulo = document.getElementById("tituloSistema");
const bioStatus = document.getElementById("bioStatus");
const placeholder = document.getElementById("placeholder");

function loadingOn(v) {
  loading.classList.toggle("hidden", !v);
}

function setActive(btn) {
  document.querySelectorAll(".menu-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

function iniciarSistema() {
  placeholder.classList.add("hidden");
}

/* EVENTO CARREGAMENTO */
window.api.onLoadFinished(() => {
  loadingOn(false);
});

/* BOTÕES PRINCIPAIS */
btnCaptura.onclick = async () => {
  iniciarSistema();
  setActive(btnCaptura); // UX: Fica azul e mostra tag ATIVO
  titulo.innerText = "CapturaWeb";
  loadingOn(true);
  await window.api.abrirCaptura();
};

btnSmart.onclick = async () => {
  iniciarSistema();
  setActive(btnSmart); // UX: Fica azul e mostra tag ATIVO
  titulo.innerText = "SMART (CIN)";
  loadingOn(true);
  await window.api.abrirSmart();
};

/* DROPDOWN */
document.querySelectorAll(".dots").forEach(dot => {
  dot.onclick = (e) => {
    e.stopPropagation();
    const id = dot.dataset.menu;
    document.querySelectorAll(".dropdown").forEach(d => {
        if(d.id !== id) d.classList.remove("show");
    });
    document.getElementById(id).classList.toggle("show");
  };
});

document.addEventListener("click", () => {
  document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("show"));
});

/* AÇÕES */
document.getElementById("reload").onclick =
document.getElementById("reload2").onclick = () => window.api.reloadPage();

document.getElementById("cache").onclick =
document.getElementById("cache2").onclick = () => window.api.clearCache();

/* STATUS E INFO */
window.api.onBioStatus((online) => {
  bioStatus.className = "status " + (online ? "online" : "offline");
  bioStatus.innerText = online ? "ONLINE" : "OFFLINE";
});

(async () => {
  const info = await window.api.getSystemInfo();
  document.getElementById("hostname").innerText = info.hostname;
  document.getElementById("ip").innerText = info.ip;
})();