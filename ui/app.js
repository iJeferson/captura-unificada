const loadingOn = (v) => {
    const loader = document.getElementById("loading");
    loader?.classList.toggle("hidden", !v);
    document.body.style.pointerEvents = v ? "none" : "auto";
};

const setActive = (btn) => {
    document.querySelectorAll(".menu-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("placeholder")?.classList.add("hidden");
};

document.getElementById("captura").onclick = async (e) => {
    if (e.currentTarget.classList.contains("active")) return;
    setActive(e.currentTarget);
    loadingOn(true);
    await window.api.abrirCaptura();
};

document.getElementById("smart").onclick = async (e) => {
    if (e.currentTarget.classList.contains("active")) return;
    setActive(e.currentTarget);
    loadingOn(true);
    await window.api.abrirSmart();
};

const sidebar = document.getElementById("sidebar");
const toggleBtn = document.getElementById("toggle-sidebar");
const toggleIcon = document.getElementById("toggle-icon");

if (toggleBtn) {
    toggleBtn.onclick = () => {
        const isCollapsed = sidebar.classList.toggle("collapsed");
        toggleIcon.className = isCollapsed ? "fas fa-chevron-right" : "fas fa-chevron-left";
        window.api.resizeSidebar(isCollapsed ? 80 : 260);
    };
}

window.api.onLoadFinished(() => {
    loadingOn(false);
});

(async () => {
    const info = await window.api.getSystemInfo();
    if (document.getElementById("hostname")) document.getElementById("hostname").innerText = info.hostname;
    if (document.getElementById("ip")) document.getElementById("ip").innerText = info.ip;
    if (document.getElementById("anydesk")) document.getElementById("anydesk").innerText = info.anydesk;
})();

window.api.onUpdateIP((novoIp) => {
    const ipEl = document.getElementById("ip");
    if (ipEl) ipEl.innerText = novoIp;
});

document.querySelectorAll(".dots").forEach(dot => {
    dot.onclick = (e) => {
        e.stopPropagation();
        const menuId = dot.dataset.menu;
        document.getElementById(menuId).classList.toggle("show");
    };
});

document.addEventListener("click", () => {
    document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("show"));
});

document.querySelectorAll(".btn-reload").forEach(btn => {
    btn.onclick = () => window.api.reloadPage();
});

document.querySelectorAll(".btn-cache").forEach(btn => {
    btn.onclick = async () => await window.api.clearCache();
});

document.getElementById("theme-toggle").onclick = () => {
    const body = document.body;
    const isDark = body.classList.toggle("dark-theme");
    body.classList.toggle("light-theme", !isDark);
    document.getElementById("theme-icon").className = isDark ? "fas fa-moon" : "fas fa-sun";
    document.getElementById("theme-text").innerText = isDark ? "Modo Escuro" : "Modo Claro";
};