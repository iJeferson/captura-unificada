let estaCarregando = false;

const loadingOn = (v, nomeSistema = "") => {
    estaCarregando = v;
    const loader = document.getElementById("loading");
    const loaderText = loader?.querySelector("p");
    const contentArea = document.querySelector(".content"); // Seleciona a área do sistema

    if (loader) {
        if (v) {
            // Ao iniciar o loading
            loader.classList.remove("hidden");
            if (loaderText && nomeSistema) {
                loaderText.innerText = `Iniciando ${nomeSistema}`;
            }
            // Remove a classe de animação da área de conteúdo para o próximo carregamento
            contentArea?.classList.remove("fade-in-view");
        } else {
            // Ao finalizar o loading
            loader.classList.add("hidden");
            
            // DISPARA O EFEITO FADE-IN NA PÁGINA
            if (contentArea) {
                contentArea.classList.remove("fade-in-view");
                void contentArea.offsetWidth; // Truque para resetar animação CSS
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