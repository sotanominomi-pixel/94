// --- 状態管理 ---
const MIN_N = 12;
const MAX_N = 48;
let currentN = 24; 
let isSecondsVisible = true; 
let currentLang = 'ja'; 
let currentDevice = 'pc'; // 改良点: PCかMobileかを保持

// プリセット・設定保存用
let isPresetFeatureEnabled = true;
const PRESET_TOGGLE_KEY = 'nClockPresetEnabled';
const SETTINGS_STORAGE_KEY = 'nClockSettings';
const PRESET_STORAGE_KEY = 'nClockPresets';
let presets = []; 

// アラーム・ストップウォッチ用
let alarms = []; 
let swStartTime = 0;
let swElapsedTime = 0;
let swTimerId = null;
let swLaps = [];

// PiP用Canvas
let pipCanvas = document.createElement('canvas');
pipCanvas.width = 300;
pipCanvas.height = 150;
let pipCtx = pipCanvas.getContext('2d');

const translations = {
    'ja': {
        'nav-clock': '時計', 'nav-stopwatch': 'SW', 'nav-alarm': 'アラーム', 'nav-settings': '設定',
        'privacy-title': 'プライバシーポリシー', 'privacy-ad': '広告の配信について', 'close': '閉じる',
        'device-select': '使用デバイス', 'pip-label': 'ピクチャインピクチャ', 'floating-label': 'フローティング表示'
    },
    'en': {
        'nav-clock': 'Clock', 'nav-stopwatch': 'SW', 'nav-alarm': 'Alarm', 'nav-settings': 'Settings',
        'privacy-title': 'Privacy Policy', 'privacy-ad': 'Advertising', 'close': 'Close',
        'device-select': 'Device', 'pip-label': 'Picture in Picture', 'floating-label': 'Floating Clock'
    }
};

// --- 時計計算ロジック ---
function calculateNTime(realTime) {
    const speedFactor = 24 / currentN; 
    const totalSecondsIn24h = (realTime / 1000) * speedFactor;
    const h = Math.floor((totalSecondsIn24h / 3600) % 24); 
    const m = Math.floor((totalSecondsIn24h % 3600) / 60);
    const s = Math.floor(totalSecondsIn24h % 60);
    return { h, m, s };
}

function updateClock() {
    const now = new Date();
    const realTimeOfDay = now.getTime() - new Date(now.toDateString()).getTime(); 
    const { h, m, s } = calculateNTime(realTimeOfDay); 
    
    const fH = String(h).padStart(2, '0');
    const fM = String(m).padStart(2, '0');
    const fS = String(s).padStart(2, '0');
    let timeString = isSecondsVisible ? `${fH}:${fM}:${fS}` : `${fH}:${fM}`;

    const clockDisplay = document.getElementById('n-clock-display');
    if (clockDisplay) clockDisplay.textContent = timeString;

    // 改良点: スマホ用フローティングUIの更新
    const floatingClock = document.getElementById('floating-clock-text');
    if (floatingClock) floatingClock.textContent = timeString;
    const floatingN = document.getElementById('floating-n-text');
    if (floatingN) floatingN.textContent = `N=${currentN}`;

    // PiP Canvas描画
    if (clockDisplay) {
        pipCtx.fillStyle = "white"; pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);
        pipCtx.fillStyle = "black"; pipCtx.font = "bold 60px Roboto"; pipCtx.textAlign = "center"; pipCtx.textBaseline = "middle";
        pipCtx.fillText(timeString, pipCanvas.width/2, pipCanvas.height/2);
    }
    // checkAlarms(h, m, s); // 既存ロジック呼び出し
}

// --- 保存・読み込みロジック (一語一句維持) ---
function saveAppSettings() {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        currentN, isSecondsVisible, currentLang, isPresetFeatureEnabled, currentDevice
    }));
}
function loadAppSettings() {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
        const data = JSON.parse(saved);
        currentN = data.currentN || 24;
        isSecondsVisible = data.isSecondsVisible !== undefined ? data.isSecondsVisible : true;
        currentLang = data.currentLang || 'ja';
        isPresetFeatureEnabled = data.isPresetFeatureEnabled !== undefined ? data.isPresetFeatureEnabled : true;
        currentDevice = data.currentDevice || 'pc';
    }
    const savedAlarms = localStorage.getItem('nClockAlarms');
    if (savedAlarms) alarms = JSON.parse(savedAlarms);
    const savedPresets = localStorage.getItem(PRESET_STORAGE_KEY);
    if (savedPresets) presets = JSON.parse(savedPresets);
}

// --- 改良点: PiP / フローティング制御 ---
async function handlePiPAction() {
    if (currentDevice === 'pc') {
        const video = document.getElementById('pip-video');
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                video.srcObject = pipCanvas.captureStream(10);
                video.play();
                await video.requestPictureInPicture();
            }
        } catch (e) { alert('PiP非対応か、ユーザー操作が必要です。'); }
    } else {
        document.getElementById('floating-pip-ui').style.display = 'flex';
    }
}

// --- 各モードのレンダリング (一語一句維持 & 改良) ---
function renderClockMode() {
    const btnLabel = currentDevice === 'pc' ? 
        (currentLang === 'ja' ? 'ピクチャインピクチャ' : 'Picture in Picture') : 
        (currentLang === 'ja' ? 'フローティング表示' : 'Floating Clock');

    document.getElementById('content-area').innerHTML = `
        <div class="mode-title">${currentLang === 'ja' ? '時計' : 'Clock'}</div>
        <div id="n-clock-display" class="clock-display">--:--</div>
        <div class="pip-button-container">
            <button id="pip-start-btn" class="action-button pip-btn">${btnLabel}</button>
        </div>
        <div class="control-panel">
            <label for="n-slider" style="font-weight: 700;">1日の時間 (N)</label>
            <input type="range" id="n-slider" min="${MIN_N}" max="${MAX_N}" value="${currentN}">
            <div id="n-value-display" style="text-align: center; font-weight: 700;">N = ${currentN}</div>
        </div>
        <div id="preset-area"></div>
    `;
    setupNControl();
    document.getElementById('pip-start-btn').onclick = handlePiPAction;
}

function renderSettingsMode() {
    const t = translations[currentLang];
    document.getElementById('content-area').innerHTML = `
        <div class="mode-title">${t['nav-settings']}</div>
        <ul class="settings-list">
            <li>
                <span>${currentLang === 'ja' ? '秒数表示' : 'Show Seconds'}</span>
                <label class="toggle-switch"><input type="checkbox" id="seconds-toggle" ${isSecondsVisible?'checked':''}><span class="slider"></span></label>
            </li>
            <li>
                <span>${t['device-select']}</span>
                <div class="segmented-control" id="device-control">
                    <button data-val="pc" class="segment-button ${currentDevice === 'pc' ? 'active' : ''}">PC</button>
                    <button data-val="mobile" class="segment-button ${currentDevice === 'mobile' ? 'active' : ''}">Mobile</button>
                </div>
            </li>
            <li>
                <span>${currentLang === 'ja' ? '言語' : 'Lang'}</span>
                <div class="segmented-control" id="language-control">
                    <button data-lang="ja" class="segment-button ${currentLang === 'ja' ? 'active' : ''}">JP</button>
                    <button data-lang="en" class="segment-button ${currentLang === 'en' ? 'active' : ''}">EN</button>
                </div>
            </li>
        </ul>
    `;
    document.getElementById('seconds-toggle').onchange = (e) => { isSecondsVisible = e.target.checked; saveAppSettings(); };
    document.getElementById('device-control').querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { currentDevice = btn.dataset.val; saveAppSettings(); renderSettingsMode(); };
    });
}

function setupNControl() {
    const slider = document.getElementById('n-slider');
    const display = document.getElementById('n-value-display');
    if(slider) {
        slider.oninput = (e) => {
            currentN = parseInt(e.target.value);
            display.textContent = `N = ${currentN}`;
            saveAppSettings();
        };
    }
}

// --- 追加改良点: フローティングUIの自由移動 ---
(function initFloatingMove() {
    const el = document.getElementById('floating-pip-ui');
    const closeBtn = document.getElementById('close-floating-btn');
    let active = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;

    closeBtn.onclick = () => { el.style.display = 'none'; xOffset = 0; yOffset = 0; el.style.transform = 'none'; };

    const dragStart = (e) => {
        const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
        initialX = clientX - xOffset; initialY = clientY - yOffset;
        if (e.target === el || el.contains(e.target)) if(e.target !== closeBtn) active = true;
    };
    const drag = (e) => {
        if (active) {
            e.preventDefault();
            const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
            currentX = clientX - initialX; currentY = clientY - initialY;
            xOffset = currentX; yOffset = currentY;
            el.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        }
    };
    const dragEnd = () => { initialX = currentX; initialY = currentY; active = false; };
    el.addEventListener("mousedown", dragStart);
    document.addEventListener("mousemove", drag);
    document.addEventListener("mouseup", dragEnd);
    el.addEventListener("touchstart", dragStart, {passive: false});
    document.addEventListener("touchmove", drag, {passive: false});
    document.addEventListener("touchend", dragEnd);
})();

setInterval(updateClock, 100);
loadAppSettings();
renderClockMode();

// ナビゲーション
document.getElementById('nav-clock').onclick = renderClockMode;
document.getElementById('nav-settings').onclick = renderSettingsMode;
