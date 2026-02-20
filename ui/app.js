let estaCarregando = false;

const loadingOn = (v, nomeSistema = "") => {
    estaCarregando = v;
    const loader = document.getElementById("loading");
    const loaderText = loader?.querySelector("p");
    const contentArea = document.querySelector(".content");

    if (loader) {
        if (v) {
            loader.classList.remove("hidden");
            if (loaderText && nomeSistema) {
                loaderText.innerText = `Iniciando ${nomeSistema}`;
            }
            contentArea?.classList.remove("fade-in-view");
        } else {
            loader.classList.add("hidden");
            if (contentArea) {
                contentArea.classList.remove("fade-in-view");
                void contentArea.offsetWidth; // Force reflow
                contentArea.classList.add("fade-in-view");
            }
        }
    }
    
    document.body.style.pointerEvents = v ? "none" : "auto";
    document.body.style.cursor = v ? "wait" : "default";
};

const setActive = (btn) => {
    document.querySelectorAll(".menu-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("placeholder")?.classList.add("hidden");
};

// --- LOGICA DE ATUALIZAÇÃO SILENCIOSA (NOVO) ---
// Quando o download termina, o main envia 'update-ready'
window.api.onUpdateReady(() => {
    const indicator = document.getElementById("update-indicator");
    if (indicator) {
        indicator.style.display = "flex"; // Mostra o badge na sidebar
    }
});

// Ao clicar no badge, reinicia o app para aplicar a nova versão
const updateBtn = document.getElementById("update-indicator");
if (updateBtn) {
    updateBtn.onclick = async () => {
        if (estaCarregando) return;
        // Opcional: mostrar um loading de "Reiniciando..."
        loadingOn(true, "Atualização");
        await window.api.applyUpdateNow();
    };
}

// --- BOTÕES PRINCIPAIS ---
document.getElementById("captura").onclick = async (e) => {
    if (estaCarregando || e.currentTarget.classList.contains("active")) return;
    setActive(e.currentTarget);
    loadingOn(true, "CapturaWeb"); 
    await window.api.abrirCaptura();
};

document.getElementById("smart").onclick = async (e) => {
    if (estaCarregando || e.currentTarget.classList.contains("active")) return;
    setActive(e.currentTarget);
    loadingOn(true, "SMART (CIN)"); 
    await window.api.abrirSmart();
};

// --- SIDEBAR ---
const sidebar = document.getElementById("sidebar");
const toggleBtn = document.getElementById("toggle-sidebar");
const toggleIcon = document.getElementById("toggle-icon");

if (toggleBtn) {
    toggleBtn.onclick = () => {
        if (estaCarregando) return;
        const isCollapsed = sidebar.classList.toggle("collapsed");
        if (toggleIcon) {
            toggleIcon.className = isCollapsed ? "fas fa-chevron-right" : "fas fa-chevron-left";
        }
        window.api.resizeSidebar(isCollapsed ? 80 : 260);
    };
}

// --- EVENTO DE CARREGAMENTO CONCLUÍDO ---
window.api.onLoadFinished(() => {
    loadingOn(false);
});

// --- INFO DO SISTEMA ---
(async () => {
    const info = await window.api.getSystemInfo();
    
    // Preenche a versão no título
    const versionEl = document.getElementById("app-version");
    if (versionEl) versionEl.innerText = `v${info.version}`;

    if (document.getElementById("hostname")) document.getElementById("hostname").innerText = info.hostname;
    if (document.getElementById("ip")) document.getElementById("ip").innerText = info.ip;
    if (document.getElementById("anydesk")) document.getElementById("anydesk").innerText = info.anydesk;
})();

window.api.onUpdateIP((novoIp) => {
    const ipEl = document.getElementById("ip");
    if (ipEl) ipEl.innerText = novoIp;
});

// --- DROPDOWNS ---
document.querySelectorAll(".dots").forEach(dot => {
    dot.onclick = (e) => {
        if (estaCarregando) return;
        e.stopPropagation();
        const menuId = dot.dataset.menu;
        document.querySelectorAll(".dropdown").forEach(d => {
            if (d.id !== menuId) d.classList.remove("show");
        });
        document.getElementById(menuId).classList.toggle("show");
    };
});

document.addEventListener("click", () => {
    document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("show"));
});

// --- RECARREGAR E CACHE ---
document.querySelectorAll(".btn-reload").forEach(btn => {
    btn.onclick = () => {
        if (estaCarregando) return;
        const activeBtn = document.querySelector(".menu-btn.active span")?.innerText.trim() || "Sistema";
        loadingOn(true, activeBtn);
        window.api.reloadPage();
    }
});

document.querySelectorAll(".btn-cache").forEach(btn => {
    btn.onclick = async () => {
        if (estaCarregando) return;
        loadingOn(true, "Limpeza de Cache");
        await window.api.clearCache();
    };
});

// --- TEMA ---
document.getElementById("theme-toggle").onclick = () => {
    if (estaCarregando) return;
    const body = document.body;
    const isDark = body.classList.toggle("dark-theme");
    body.classList.toggle("light-theme", !isDark);
    const icon = document.getElementById("theme-icon");
    const text = document.getElementById("theme-text");
    if (icon) icon.className = isDark ? "fas fa-moon" : "fas fa-sun";
    if (text) text.innerText = isDark ? "Modo Escuro" : "Modo Claro";
};