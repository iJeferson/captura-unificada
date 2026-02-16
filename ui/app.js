// Funções de Utilidade
const loadingOn = (v) => document.getElementById("loading")?.classList.toggle("hidden", !v);

const setActive = (btn) => {
    document.querySelectorAll(".menu-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("placeholder")?.classList.add("hidden");
};

// --- Cliques nos Sistemas ---
document.getElementById("captura").onclick = async (e) => {
    setActive(e.currentTarget);
    loadingOn(true);
    await window.api.abrirCaptura();
};

document.getElementById("smart").onclick = async (e) => {
    setActive(e.currentTarget);
    loadingOn(true);
    await window.api.abrirSmart();
};

// --- Dropdowns (Três Pontinhos) ---
document.querySelectorAll(".dots").forEach(dot => {
    dot.onclick = (e) => {
        e.stopPropagation();
        const menuId = dot.dataset.menu;
        document.querySelectorAll(".dropdown").forEach(d => {
            if (d.id !== menuId) d.classList.remove("show");
        });
        document.getElementById(menuId).classList.toggle("show");
    };
});

// Fecha dropdown ao clicar fora
document.addEventListener("click", () => {
    document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("show"));
});

// --- Ações Globais (Reload e Cache) ---
// Configura todos os botões que tenham as classes enviadas no index.html
document.querySelectorAll(".btn-reload").forEach(btn => {
    btn.onclick = () => window.api.reloadPage();
});

document.querySelectorAll(".btn-cache").forEach(btn => {
    btn.onclick = async () => {
        await window.api.clearCache();
        alert("Sistema limpo!");
    };
});

// --- Gestão de Tema ---
document.getElementById("theme-toggle").onclick = () => {
    const body = document.body;
    const icon = document.getElementById("theme-icon");
    const text = document.getElementById("theme-text");
    const isDark = body.classList.contains("dark-theme");

    body.classList.toggle("dark-theme", !isDark);
    body.classList.toggle("light-theme", isDark);
    icon.className = isDark ? "fas fa-sun" : "fas fa-moon";
    text.innerText = isDark ? "Modo Claro" : "Modo Escuro";
};

// --- Inicialização e Info ---
window.api.onLoadFinished(() => loadingOn(false));

(async () => {
    const info = await window.api.getSystemInfo();
    const map = { hostname: info.hostname, ip: info.ip, anydesk: info.anydesk };
    
    for (const [id, val] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    }
})();