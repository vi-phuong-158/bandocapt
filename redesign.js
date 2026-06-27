const fs = require('fs');
const path = require('path');

// --- 1. styles.css ---
let cssPath = path.join(__dirname, 'styles.css');
let css = fs.readFileSync(cssPath, 'utf8');

css = css.replace(/'Inter', sans-serif/g, "'Geist', sans-serif");
css = css.replace(/'Space Grotesk', sans-serif/g, "'Outfit', sans-serif");
css = css.replace(/#1a5c2a/g, "#1d4ed8"); // Replace police green with sharp blue
css = css.replace(/rgba\(26, 92, 42,/g, "rgba(29, 78, 216,"); // Replace green rgb
css = css.replace(/#145222/g, "#1e40af"); // Replace darker green with darker blue

// Add tactile feedback
if (!css.includes('transform: scale(0.98)')) {
    css = css.replace(
        /.result-item:hover, .result-item:active {/g,
        ".result-item:hover { background: #ffffff; transform: translate3d(0, -2px, 0); box-shadow: 0 8px 24px -4px rgba(0,0,0,0.08); border-color: rgba(255, 255, 255, 1); }\n.result-item:active { transform: scale(0.98) translateZ(0); box-shadow: 0 2px 8px -2px rgba(0,0,0,0.05); }\n/* "
    );
}

// Chatbot UI adjustments
css = css.replace(
    /border-radius: 23px;/g,
    "border-radius: 9999px;"
);

fs.writeFileSync(cssPath, css);


// --- 2. index.html ---
let htmlPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Fix eyebrows
html = html.replace(
    /text-\[11px\] text-slate-500 font-bold uppercase tracking-widest mt-0\.5/g,
    "text-[13px] text-textMuted mt-0.5" // Removed uppercase and tracking
);
html = html.replace(
    /text-\[12px\] text-slate-400 font-bold uppercase tracking-wider mb-0\.5/g,
    "text-[12px] text-textMuted font-medium mb-0.5" 
);
html = html.replace(
    /text-\[10px\] font-bold uppercase tracking-widest mb-2/g,
    "text-[12px] font-medium mb-2"
);

// Add better glassmorphism
html = html.replace(
    /bg-surface\/90 md:bg-transparent backdrop-blur-md/g,
    "bg-white/70 md:bg-transparent backdrop-blur-xl shadow-glass border-white/40"
);

// Fix loading skeleton
const oldLoading = `<li class="loading-state" role="status">Đang tải dữ liệu...</li>`;
const newLoading = `
    <li class="animate-pulse flex gap-4 p-4 rounded-2xl bg-white/50 border border-white/20 mb-2">
        <div class="w-11 h-11 bg-slate-200 rounded-xl"></div>
        <div class="flex-1 space-y-3 py-1">
            <div class="h-4 bg-slate-200 rounded w-3/4"></div>
            <div class="h-3 bg-slate-200 rounded w-1/2"></div>
        </div>
    </li>
    <li class="animate-pulse flex gap-4 p-4 rounded-2xl bg-white/50 border border-white/20 mb-2">
        <div class="w-11 h-11 bg-slate-200 rounded-xl"></div>
        <div class="flex-1 space-y-3 py-1">
            <div class="h-4 bg-slate-200 rounded w-5/6"></div>
            <div class="h-3 bg-slate-200 rounded w-2/5"></div>
        </div>
    </li>
`;
html = html.replace(oldLoading, newLoading);

// Fix chatbot icon to look more like a command pill
html = html.replace(
    /<span class="material-symbols-outlined text-\[20px\]" aria-hidden="true">chat<\/span>/g,
    `<span class="material-symbols-outlined text-[20px]" aria-hidden="true">forum</span>`
);

html = html.replace(
    /style="background-color:#1a5c2a;box-shadow:0 8px 24px rgba\(26,92,42,0\.35\);"/g,
    `style="background-color:#1d4ed8;box-shadow:0 8px 24px rgba(29,78,216,0.35);"`
);

fs.writeFileSync(htmlPath, html);

// --- 3. chatbot.js (if any loading states need update) ---
let chatbotPath = path.join(__dirname, 'js', 'chatbot.js');
let chatbot = fs.readFileSync(chatbotPath, 'utf8');
chatbot = chatbot.replace(
    /const bubble = document\.createElement\('div'\);\n        bubble\.className = `ai-chat-bubble ai-chat-bubble--\${sender}`;/g,
    "const bubble = document.createElement('div');\n        bubble.className = `ai-chat-bubble ai-chat-bubble--${sender} shadow-sm`;"
);
fs.writeFileSync(chatbotPath, chatbot);

console.log("Applied taste-skill upgrades.");
