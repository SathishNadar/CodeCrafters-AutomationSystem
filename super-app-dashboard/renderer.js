const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { ipcRenderer } = require('electron');
const analytics = require('./analytics');

document.addEventListener('DOMContentLoaded', () => {
    const THEME_STORAGE_KEY = 'super-app-theme';
    const THEMES = {
        'theme-nocturne': { label: 'Theme: Nocturne', icon: 'dark_mode' },
        'theme-solstice': { label: 'Theme: Solstice', icon: 'light_mode' },
        'theme-starfield': { label: 'Theme: Star', icon: 'auto_awesome' },
    };

    let latestVsCodePayload = null;
    let latestCognitiveSnapshot = analytics.getSnapshot();
    let vscodeEventHistory = [];
    let currentUser = null;
    let pendingProtectedTarget = null;
    let vscodeContextMode = 'live';
    let lastWorkingContext = null;
    function formatEventTitle(value) {
        return (value || 'unknown_event')
            .split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    function formatTimestamp(value) {
        if (!value) return '--';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '--';
        return date.toLocaleString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            day: '2-digit',
            month: 'short',
        });
    }

    function formatDisplayName(user) {
        const rawName = (user?.displayName || user?.name || '').trim();
        if (rawName && !rawName.includes('@')) return rawName;

        const email = (user?.email || '').trim();
        if (!email) return 'Google User';

        const localPart = email.split('@')[0] || '';
        const cleaned = localPart
            .replace(/[._-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!cleaned) return 'Google User';

        return cleaned
            .split(' ')
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    function finishUserLogin(user) {
        storeUser({
            name: formatDisplayName(user),
            email: user.email || '',
            picture: user.picture || '',
            mode: 'user'
        });
        closeAuthOverlay();

        if (pendingProtectedTarget) {
            const btn = [...navButtons].find(b => b.getAttribute('data-target') === pendingProtectedTarget);
            if (btn) loadProtectedView(pendingProtectedTarget, btn);
            pendingProtectedTarget = null;
        }
    }

    function applyTheme(themeName) {
        const safeTheme = THEMES[themeName] ? themeName : 'theme-nocturne';
        Object.keys(THEMES).forEach(name => htmlEl.classList.remove(name));
        htmlEl.classList.add(safeTheme);
        localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
        if (themeBtn) {
            themeBtn.querySelector('span:first-child').textContent = THEMES[safeTheme].label;
            themeBtn.querySelector('.material-symbols-outlined').textContent = THEMES[safeTheme].icon;
        }
        document.querySelectorAll('[data-theme-choice]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-theme-choice') === safeTheme);
        });
    }

    function cycleTheme() {
        const themeNames = Object.keys(THEMES);
        const currentTheme = themeNames.find(name => htmlEl.classList.contains(name)) || 'theme-nocturne';
        const currentIndex = themeNames.indexOf(currentTheme);
        const nextTheme = themeNames[(currentIndex + 1) % themeNames.length];
        applyTheme(nextTheme);
    }

    // 1. Theme Toggling Setup
    const themeBtn = document.getElementById('theme-btn');
    const htmlEl = document.documentElement;
    const operatorNameEl = document.getElementById('operator-name');
    const operatorStatusEl = document.getElementById('operator-status');
    const operatorAvatarEl = document.getElementById('operator-avatar-img');
    const topbarLoginBtn = document.getElementById('topbar-login-btn');
    const authOverlay = document.getElementById('auth-overlay');
    const authTitle = document.getElementById('auth-title');
    const authSubtitle = document.getElementById('auth-subtitle');
    const guestEntryBtn = document.getElementById('guest-entry-btn');
    const googleLoginBtn = document.getElementById('google-login-btn');

    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'theme-nocturne');
    themeBtn.addEventListener('click', cycleTheme);

    const USER_STORAGE_KEY = 'super-app-current-user';

    function storeUser(user) {
        currentUser = user;
        if (user) {
            localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
        } else {
            localStorage.removeItem(USER_STORAGE_KEY);
        }
        updateOperatorCard();
    }

    function updateOperatorCard() {
        const safeUser = currentUser || { name: 'Guest', email: '', mode: 'guest' };
        const avatarBg = safeUser.mode === 'guest' ? '#64748b' : '#1f6feb';
        const initial = (safeUser.name || 'G').charAt(0).toUpperCase();

        operatorNameEl.textContent = safeUser.name || 'Guest';
        operatorStatusEl.textContent = safeUser.mode === 'guest' ? 'Guest session' : (safeUser.email || 'Logged in');
        
        const avatarContainer = document.querySelector('.operator-avatar');
        if (avatarContainer) {
            avatarContainer.innerHTML = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:16px; background-color: ${avatarBg};">${initial}</div>`;
        }

        topbarLoginBtn.classList.toggle('hidden', safeUser.mode !== 'guest');
    }

    function openAuthOverlay() {
        authTitle.textContent = 'Choose how to enter';
        authSubtitle.textContent = 'Continue as a guest to explore the dashboard, or use Google login to unlock inbox, rules, history, and live services.';
        authOverlay.classList.remove('hidden');
    }

    function closeAuthOverlay() {
        authOverlay.classList.add('hidden');
    }

    function loadProtectedView(targetId, btn) {
        navButtons.forEach(b => {
            b.classList.remove('active', 'text-dynamic');
            b.classList.add('text-dynamic-variant', 'bg-transparent');
        });
        btn.classList.add('active');
        btn.classList.remove('text-dynamic-variant', 'bg-transparent');
        loadView(targetId);
        breadcrumb.textContent = btn.querySelector('span:last-child').textContent;
    }

    function isGuest() {
        return !currentUser || currentUser.mode === 'guest';
    }

    // Load persisted user or default to guest
    let savedUser = null;
    try {
        const stored = localStorage.getItem(USER_STORAGE_KEY);
        if (stored) savedUser = JSON.parse(stored);
    } catch (e) { console.warn('Failed to parse saved user', e); }

    currentUser = savedUser || { name: 'Guest', email: '', mode: 'guest' };
    updateOperatorCard();
    
    // Only force auth overlay if there is NO saved user at all
    if (!savedUser) {
        openAuthOverlay();
    }

    // If they were logged in, optionally we could send an IPC to ensure backend is ready,
    // but the backend auto-initializes via token.json and .wwebjs_auth

    guestEntryBtn?.addEventListener('click', () => {
        storeUser({ name: 'Guest', email: '', mode: 'guest' });
        pendingProtectedTarget = null;
        closeAuthOverlay();
    });

    topbarLoginBtn?.addEventListener('click', () => openAuthOverlay());

    async function runGoogleLogin() {
        authSubtitle.textContent = 'Opening Google sign-in...';
        googleLoginBtn.disabled = true;

        try {
            const user = await ipcRenderer.invoke('google-login');
            finishUserLogin(user);
            await ipcRenderer.invoke('relink-email');
        } catch (error) {
            authSubtitle.textContent = `Google sign-in failed: ${error.message}`;
        } finally {
            googleLoginBtn.disabled = false;
        }
    }

    googleLoginBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        runGoogleLogin();
    });

    // 2. Sidebar Navigation Routing
    const navButtons = document.querySelectorAll('.nav-btn');
    const viewContainer = document.getElementById('view-container');
    const breadcrumb = document.getElementById('breadcrumb-current');

    async function loadView(viewName) {
        const renderLoadedView = (data) => {
            viewContainer.innerHTML = data;
            attachViewListeners(viewName);
        };

        try {
            const response = await fetch(`/views/${viewName}.html`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            renderLoadedView(html);
            return;
        } catch (fetchError) {
            console.warn(`[Renderer] HTTP view load failed for ${viewName}:`, fetchError.message);
        }

        if (typeof __dirname !== 'undefined') {
            const filePath = path.join(__dirname, 'views', `${viewName}.html`);
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    console.error("Error loading view:", err);
                    viewContainer.innerHTML = '<p class="text-dynamic text-center mt-10">Error loading view component</p>';
                    return;
                }
                renderLoadedView(data);
            });
            return;
        }

        viewContainer.innerHTML = '<p class="text-dynamic text-center mt-10">Error loading view component</p>';
    }

    async function fetchLastWorkingContext() {
        try {
            lastWorkingContext = await ipcRenderer.invoke('get-last-working-context');
            renderVsCodeContextView();
        } catch (error) {
            console.error('Failed to load last working context:', error);
        }
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const isProtected = btn.getAttribute('data-protected') === 'true';
        if (isProtected && isGuest()) {
                pendingProtectedTarget = targetId;
                openAuthOverlay();
                return;
            }

            loadProtectedView(targetId, btn);
        });
    });

    document.getElementById('topbar-profile-btn')?.addEventListener('click', (e) => {
        // Prevent triggering the login button click inside the card
        if (e.target.tagName.toLowerCase() === 'button') return;
        
        if (isGuest()) {
            openAuthOverlay();
            return;
        }
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('breadcrumb-current').textContent = 'Profile';
        loadView('profile');
    });

    // 3. Post-load Interaction Hooks
    function attachViewListeners(viewName) {
        if (viewName === 'dashboard') {
            // Dashboard - Tab Management
            const tabButtons = document.querySelectorAll('.tab-btn');
            const tabContents = document.querySelectorAll('.tab-content');

            tabButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    tabButtons.forEach(b => { 
                        b.classList.remove('active', 'text-primary-dynamic'); 
                        b.classList.add('text-dynamic-variant'); 
                    });
                    tabContents.forEach(c => c.classList.remove('active'));
                    
                    btn.classList.add('active', 'text-primary-dynamic');
                    btn.classList.remove('text-dynamic-variant');
                    
                    const targetId = btn.getAttribute('data-tab');
                    document.getElementById(targetId).classList.add('active');
                });
            });

            // Dashboard - Custom Toggles
            const labels = document.querySelectorAll('label.toggle-label');
            labels.forEach(label => {
                label.addEventListener('click', (e) => {
                    e.preventDefault();
                    const track = label.querySelector('.toggle-track');
                    const thumb = label.querySelector('.toggle-thumb');
                    if(track && thumb) {
                        if(thumb.classList.contains('translate-x-4')) {
                            thumb.classList.remove('translate-x-4');
                            track.classList.add('opacity-50', 'bg-gray-400');
                            track.classList.remove('bg-primary-dynamic', 'bg-secondary-dynamic');
                        } else {
                            thumb.classList.add('translate-x-4');
                            track.classList.remove('opacity-50', 'bg-gray-400');
                            if(label.innerText.includes('Social')) track.classList.add('bg-secondary-dynamic');
                            else track.classList.add('bg-primary-dynamic');
                        }
                    }
                });
            });

            // Dashboard - Action Hub Fast Actions
            const actionBtns = document.querySelectorAll('.action-btn');
            actionBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const card = e.target.closest('.glass-panel');
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.95)';
                    setTimeout(() => card.style.display = 'none', 300);
                });
            });
        }

        if (viewName === 'test-notification') {
            const btn = document.getElementById('test-vscode-btn');
            const status = document.getElementById('vscode-test-status');
            if (btn && status) {
                btn.addEventListener('click', async () => {
                    status.style.opacity = '1';
                    status.textContent = 'Sending...';
                    status.className = 'text-[11px] font-medium px-2 py-1 rounded-md bg-transparent transition-opacity text-dynamic-variant';
                    
                    try {
                        const response = await fetch('http://localhost:3100/notify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message: "Hello from Neon Observatory! ContextBridge is connected 🚀" })
                        });
                        
                        if (response.ok) {
                            status.textContent = 'Success!';
                            status.className = 'text-[11px] font-medium px-2 py-1 rounded-md bg-transparent transition-opacity text-green-500';
                            
                            // Visual feedback on button
                            const originalContent = btn.innerHTML;
                            btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span> Pinged!';
                            btn.classList.add('bg-green-600');
                            btn.classList.remove('bg-blue-600');
                            
                            setTimeout(() => {
                                btn.innerHTML = originalContent;
                                btn.classList.remove('bg-green-600');
                                btn.classList.add('bg-blue-600');
                            }, 3000);
                        } else {
                            throw new Error('HTTP ' + response.status);
                        }
                    } catch (error) {
                        status.textContent = 'Failed: ' + error.message;
                        status.className = 'text-[11px] font-medium px-2 py-1 rounded-md bg-transparent transition-opacity text-red-500';
                    }
                    
                    setTimeout(() => {
                        status.style.opacity = '0';
                    }, 5000);
                });
            }
        }

        if (viewName === 'history') {
            const picker = document.getElementById('history-date-picker');
            const loadBtn = document.getElementById('history-load-btn');
            const status = document.getElementById('history-status');

            // Default to today
            if (picker) picker.value = new Date().toISOString().split('T')[0];

            const loadHistory = async () => {
                const dateKey = picker?.value;
                if (!dateKey) return;

                status.textContent = 'Loading...';
                status.style.opacity = '1';

                const summary = await ipcRenderer.invoke('get-day-summary', dateKey);

                if (!summary) {
                    document.getElementById('history-empty').classList.remove('hidden');
                    document.getElementById('history-stats-grid').style.opacity = '0';
                    document.getElementById('history-state-breakdown').style.opacity = '0';
                    document.getElementById('history-language-card').style.opacity = '0';
                    status.textContent = 'No data found.';
                    setTimeout(() => status.style.opacity = '0', 3000);
                    return;
                }

                document.getElementById('history-empty').classList.add('hidden');

                // Populate stats
                document.getElementById('h-focus').textContent = summary.focusMinutes ?? 0;
                document.getElementById('h-saves').textContent = summary.saves ?? 0;
                document.getElementById('h-commits').textContent = summary.commits ?? 0;
                document.getElementById('h-load').textContent = (summary.cognitiveLoadAvg ?? 0) + '%';
                document.getElementById('h-language').textContent = summary.primaryLanguage ?? '—';

                // State breakdown bars
                const barContainer = document.getElementById('h-state-bars');
                const stateColors = {
                    deep_focus: 'bg-blue-500', bug_hunt: 'bg-red-500',
                    exploring: 'bg-yellow-500', idle: 'bg-gray-500', shipping: 'bg-green-500',
                };
                const totalMin = Object.values(summary.stateBreakdown || {}).reduce((a, b) => a + b, 0) || 1;
                barContainer.innerHTML = Object.entries(summary.stateBreakdown || {}).map(([state, min]) => {
                    const pct = Math.round((min / totalMin) * 100);
                    return `
                        <div class="flex items-center gap-3">
                            <span class="text-xs text-dynamic-variant w-24 capitalize">${state.replace('_', ' ')}</span>
                            <div class="flex-1 h-2 rounded-full bg-[var(--surface-high)]">
                                <div class="h-2 rounded-full ${stateColors[state] || 'bg-primary-dynamic'} transition-all duration-700" style="width: ${pct}%"></div>
                            </div>
                            <span class="text-xs text-dynamic-variant w-12 text-right">${min}m</span>
                        </div>`;
                }).join('');

                document.getElementById('history-stats-grid').style.opacity = '1';
                document.getElementById('history-state-breakdown').style.opacity = '1';
                document.getElementById('history-language-card').style.opacity = '1';
                status.textContent = 'Loaded from Firestore ✓';
                setTimeout(() => status.style.opacity = '0', 3000);
            };

            if (loadBtn) loadBtn.addEventListener('click', loadHistory);
            setTimeout(loadHistory, 300); // Auto-load today
        }

        if (viewName === 'settings') {
            document.querySelectorAll('[data-theme-choice]').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-theme-choice') === (localStorage.getItem(THEME_STORAGE_KEY) || 'theme-nocturne'));
                btn.addEventListener('click', () => applyTheme(btn.getAttribute('data-theme-choice')));
            });
        }

        if (viewName === 'vscode-context') {
            document.getElementById('vc-filter-live')?.addEventListener('click', () => {
                vscodeContextMode = 'live';
                weeklyData = null;
                renderVsCodeContextView();
            });
            document.getElementById('vc-filter-last-working')?.addEventListener('click', async () => {
                vscodeContextMode = 'last-working';
                await fetchAndRenderWeekly();
            });
            renderVsCodeContextView();
        }

        if (viewName === 'browser-intelligence') {
            biViewActive = true;
            biRenderAll();
            if (biRefreshTimer) clearInterval(biRefreshTimer);
            biRefreshTimer = setInterval(biRenderAll, 5000);
        } else {
            biViewActive = false;
            if (biRefreshTimer) { clearInterval(biRefreshTimer); biRefreshTimer = null; }
        }

        if (viewName === 'profile') {
            document.getElementById('profile-name').value = currentUser.name || '';
            document.getElementById('profile-email').value = currentUser.email || '';
            document.getElementById('profile-phone').value = localStorage.getItem('profile_phone') || '';
            document.getElementById('profile-vips').value = localStorage.getItem('profile_vips') || '';

            let saveProfileBtn = document.getElementById('save-profile-btn');
            if (saveProfileBtn) {
                saveProfileBtn.onclick = async () => {
                    const btn = saveProfileBtn;
                    const orig = btn.innerHTML;
                    btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span> Saving...`;

                    const vips = document.getElementById('profile-vips').value.trim();
                    const phone = document.getElementById('profile-phone').value.trim();
                    
                    // Save to local storage
                    localStorage.setItem('profile_phone', phone);
                    localStorage.setItem('profile_vips', vips);
                    
                    // Tell main process to update whatsapp-monitor-service vip file
                    try {
                        await ipcRenderer.invoke('save-vips', vips);
                    } catch (e) {
                        console.error('Failed to save VIPs remotely', e);
                    }

                    // Update standard user info in dashboard memory
                    const updatedUser = { ...currentUser, name: document.getElementById('profile-name').value.trim() };
                    storeUser(updatedUser);

                    setTimeout(() => { btn.innerHTML = orig; }, 800);
                };
            }

            let unlinkEmailBtn = document.getElementById('unlink-email-btn');
            if (unlinkEmailBtn) {
                unlinkEmailBtn.onclick = async () => {
                    if (confirm('Are you sure you want to disconnect your Gmail integration? A browser window will open immediately to sign in again.')) {
                        const res = await ipcRenderer.invoke('unlink-email');
                        if (res.message) alert(res.message);
                        storeUser(null);
                        openAuthOverlay();
                    }
                };
            }

            let unlinkWaBtn = document.getElementById('unlink-wa-btn');
            if (unlinkWaBtn) {
                // Restore UI state from local storage immediately on load
                if (localStorage.getItem('wa-connected') === 'true') {
                    unlinkWaBtn.innerHTML = '&#10003; Connected — Reconnect WhatsApp';
                }

                unlinkWaBtn.onclick = async () => {
                    const btn = unlinkWaBtn;
                    const qrContainer = document.getElementById('wa-qr-container');

                    // Show loading state
                    btn.disabled = true;
                    btn.innerHTML = `<span class="material-symbols-outlined text-[14px] animate-spin" style="display:inline-block">refresh</span> Restarting...`;

                    const stopWA = document.getElementById('stop-wa-btn');
                    if (stopWA) stopWA.style.display = 'block';

                    // Show the QR area with a waiting message immediately
                    if (qrContainer) {
                        qrContainer.style.display = 'flex';
                        const canvas = document.getElementById('wa-profile-qr');
                        if (canvas) {
                            const ctx = canvas.getContext('2d');
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                        }
                        const waitMsg = qrContainer.querySelector('p');
                        if (waitMsg) waitMsg.textContent = 'Starting... QR loading shortly';
                    }

                    const res = await ipcRenderer.invoke('unlink-whatsapp');

                    // Keep loading state — QR will arrive via whatsapp-qr IPC event
                    // and the global handler will draw it + update the container
                    btn.innerHTML = `<span class="material-symbols-outlined text-[14px]">qr_code_scanner</span> Waiting for QR...`;

                    // Auto-reset button after 60s if no QR comes
                    setTimeout(() => {
                        if (btn.disabled) {
                            btn.disabled = false;
                            btn.innerHTML = 'Reconnect WhatsApp';
                        }
                    }, 60000);

                    if (!res.success) {
                        btn.disabled = false;
                        btn.innerHTML = 'Reconnect WhatsApp';
                        if (qrContainer) qrContainer.style.display = 'none';
                        alert('WhatsApp restart failed: ' + (res.message || 'Unknown error'));
                    }
                };
            }

            let stopWaBtn = document.getElementById('stop-wa-btn');
            if (stopWaBtn) {
                stopWaBtn.onclick = async () => {
                    const btn = stopWaBtn;
                    const qrContainer = document.getElementById('wa-qr-container');
                    const unlinkBtn = document.getElementById('unlink-wa-btn');

                    btn.disabled = true;
                    btn.innerHTML = `<span class="material-symbols-outlined text-[14px] animate-spin" style="display:inline-block">refresh</span> Stopping...`;

                    await ipcRenderer.invoke('stop-whatsapp');
                    localStorage.removeItem('wa-connected');

                    // Reset UI
                    if (qrContainer) qrContainer.style.display = 'none';
                    btn.style.display = 'none';
                    btn.disabled = false;
                    btn.innerHTML = 'Disconnect & Hide';

                    if (unlinkBtn) {
                        unlinkBtn.disabled = false;
                        unlinkBtn.innerHTML = 'Reconnect WhatsApp';
                    }
                };
            }
        }
    }

    const ICON_MAP = {
        'typing_burst': 'edit_note',
        'file_saved': 'save',
        'editor_switch_velocity': 'swap_horiz',
        'session_started': 'folder_open',
        'debugging_started': 'bug_report',
        'debugging_stopped': 'check_circle',
        'git_commit_detected': 'commit',
        'user_idle': 'pause_circle',
        'user_returned': 'play_circle',
        'diagnostics_snapshot': 'health_and_safety',
        'focus_state_changed': 'psychology',
    };

    const STATE_BORDER_MAP = {
        deep_focus: 'border-blue-500',
        bug_hunt:   'border-red-500',
        exploring:  'border-yellow-500',
        idle:       'border-gray-500',
        shipping:   'border-green-500',
    };

    function updateCognitiveUI(snap) {
        // State Hero
        const hero = document.getElementById('state-hero');
        const stateIcon = document.getElementById('state-icon');
        const stateLabel = document.getElementById('state-label');
        const stateDesc = document.getElementById('state-desc');
        const stateDuration = document.getElementById('state-duration');
        const sessionMinutes = document.getElementById('session-minutes');
        const iconWrap = document.getElementById('state-icon-wrap');

        if (hero && snap.stateInfo) {
            // Update hero border color
            Object.values(STATE_BORDER_MAP).forEach(c => hero.classList.remove(c));
            hero.classList.add(STATE_BORDER_MAP[snap.state] || 'border-gray-500');

            stateIcon.textContent = snap.stateInfo.icon;
            stateIcon.className = `material-symbols-outlined text-3xl ${snap.stateInfo.color}`;
            iconWrap.className = `w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${snap.stateInfo.bg}`;
            stateLabel.textContent = snap.stateInfo.label;
            stateDesc.textContent = snap.stateInfo.desc;
            stateDuration.textContent = snap.timeInState < 1 ? '<1' : snap.timeInState;
            sessionMinutes.textContent = snap.session.sessionMinutes;
        }

        // Cognitive Load Arc
        const loadArc = document.getElementById('load-arc');
        const loadScore = document.getElementById('load-score');
        const loadLabel = document.getElementById('load-label');
        if (loadArc && loadScore) {
            const load = snap.cognitiveLoad;
            const circumference = 264;
            const offset = circumference - (load / 100) * circumference;
            loadArc.style.strokeDashoffset = offset;
            loadScore.textContent = load;

            if (load < 40) {
                loadArc.setAttribute('stroke', '#22c55e');
                loadLabel.textContent = 'Low Load — Comfortable';
                loadLabel.className = 'text-sm font-semibold text-green-400';
            } else if (load < 70) {
                loadArc.setAttribute('stroke', '#eab308');
                loadLabel.textContent = 'Moderate Load — Tracking';
                loadLabel.className = 'text-sm font-semibold text-yellow-400';
            } else {
                loadArc.setAttribute('stroke', '#ef4444');
                loadLabel.textContent = 'High Load — Consider a Break';
                loadLabel.className = 'text-sm font-semibold text-red-400';
            }
        }

        // Session Stats
        const s = snap.session;
        if (document.getElementById('stat-focus'))   document.getElementById('stat-focus').textContent   = s.focusMinutes;
        if (document.getElementById('stat-saves'))   document.getElementById('stat-saves').textContent   = s.saves;
        if (document.getElementById('stat-commits')) document.getElementById('stat-commits').textContent = s.commits;
        if (document.getElementById('stat-lang'))    document.getElementById('stat-lang').textContent    = s.primaryLanguage;

        // Recommendations
        const recFeed = document.getElementById('recommendations-feed');
        if (recFeed && snap.recommendations.length > 0) {
            recFeed.innerHTML = snap.recommendations.map(r => `
                <div class="glass-panel rounded-lg p-4 flex flex-col gap-2 border-l-4 border-opacity-50 transition-all" style="border-left-color: currentColor">
                    <div class="flex items-start gap-3">
                        <span class="material-symbols-outlined ${r.color} text-xl mt-0.5">${r.icon}</span>
                        <div>
                            <div class="font-semibold text-dynamic text-sm">${r.title}</div>
                            <p class="text-xs text-dynamic-variant mt-1 leading-relaxed">${r.text}</p>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }

    function updateVsCodeContextState(payload, snap) {
        latestVsCodePayload = payload;
        latestCognitiveSnapshot = snap;
        vscodeEventHistory.unshift(payload);
        if (vscodeEventHistory.length > 8) vscodeEventHistory.pop();
        if (vscodeContextMode === 'live') renderVsCodeContextView();
    }

    function summarizePayload(payload) {
        if (!payload) return 'No event summary available yet.';
        if (payload.event === 'typing_burst') return `${payload.duration_seconds ?? 0}s typing burst with ${payload.char_count ?? 0} chars.`;
        if (payload.event === 'editor_switch_velocity') return `${payload.switch_count ?? 0} file switches detected in the last minute.`;
        if (payload.event === 'diagnostics_snapshot') return `${payload.error_count ?? 0} diagnostics currently active in the workspace.`;
        if (payload.event === 'focus_state_changed') return `Focus state changed to ${(payload.to_state || 'unknown').replace('_', ' ')}.`;
        return payload.file ? `Working in ${payload.file.split('/').pop()}.` : 'Activity pulse received from VS Code.';
    }

    function updateDialVisual(load) {
        const maxLoad = 60;
        const arcEl = document.getElementById('vc-load-arc');
        const loadScoreEl = document.getElementById('vc-load-score');
        if (!arcEl || !loadScoreEl) return;
        const loadScore = Math.min(load, maxLoad);
        loadScoreEl.textContent = Math.round(load);
        const circumference = 2 * Math.PI * 42;
        arcEl.style.strokeDashoffset = circumference - (loadScore / maxLoad) * circumference;
        let color = '#34d399';
        if (load >= 40) color = '#f43f5e';
        else if (load >= 20) color = '#fbbf24';
        arcEl.style.stroke = color;
        document.getElementById('vc-load-label').textContent = load >= 40 ? 'High Pressure' : (load >= 20 ? 'Moderate Effort' : 'Cruising');
        document.getElementById('vc-load-label').style.color = color;
    }

    function renderVsCodeContextView() {
        const stateEl = document.getElementById('vc-state');
        if (!stateEl) return;

        const useWeekly = vscodeContextMode === 'last-working';

        document.getElementById('vc-filter-live')?.classList.toggle('active', !useWeekly);
        document.getElementById('vc-filter-last-working')?.classList.toggle('active', useWeekly);

        if (useWeekly) {
            renderWeeklyAnalysis();
            return;
        }

        // --- LIVE STREAM MODE ---
        const snap = latestCognitiveSnapshot || analytics.getSnapshot();
        const payload = latestVsCodePayload;

        stateEl.textContent = snap?.stateInfo?.label || 'Idle';
        document.getElementById('vc-load').textContent = snap?.cognitiveLoad ?? 0;
        document.getElementById('vc-latest-event').textContent = payload ? formatEventTitle(payload.event) : 'Waiting for activity...';
        document.getElementById('vc-file').textContent = payload?.file || 'No file detected yet';
        document.getElementById('vc-language').textContent = payload?.language || snap?.session?.primaryLanguage || '--';
        document.getElementById('vc-time').textContent = formatTimestamp(payload?.timestamp);
        document.getElementById('vc-summary').textContent = summarizePayload(payload);
        document.getElementById('vc-chars').textContent = payload?.char_count ?? 0;
        document.getElementById('vc-switches').textContent = payload?.switch_count ?? 0;
        document.getElementById('vc-errors').textContent = payload?.error_count ?? 0;
        document.getElementById('vc-session-min').textContent = snap?.session?.sessionMinutes ?? 0;
        document.getElementById('vc-raw-payload').textContent = payload ? JSON.stringify(payload, null, 2) : 'No payload received yet.';
        document.getElementById('vc-source').textContent = 'Live ContextBridge stream';
        document.getElementById('vc-date-key').textContent = 'Current session';

        updateDialVisual(snap?.cognitiveLoad ?? 0);

        const eventList = document.getElementById('vc-event-list');
        if (eventList) {
            if (!vscodeEventHistory.length) {
                eventList.innerHTML = '<div class="glass-panel rounded-2xl p-4 text-sm text-dynamic-variant text-center">Waiting for VS Code activity...</div>';
            } else {
                eventList.innerHTML = vscodeEventHistory.map(item => `
                    <div class="glass-panel rounded-2xl p-4 border-l-4 border-secondary-dynamic">
                        <div class="flex items-center justify-between gap-3">
                            <div class="font-semibold text-dynamic text-sm">${formatEventTitle(item.event)}</div>
                            <div class="text-[11px] text-dynamic-variant">${formatTimestamp(item.timestamp)}</div>
                        </div>
                        <div class="text-xs text-dynamic-variant mt-2">${summarizePayload(item)}</div>
                    </div>
                `).join('');
            }
        }
    }

    let weeklyData = null;

    async function fetchAndRenderWeekly() {
        document.getElementById('vc-state').textContent = 'Loading...';
        try {
            weeklyData = await ipcRenderer.invoke('get-week-summaries');
            renderVsCodeContextView();
        } catch (e) {
            console.error('Failed to fetch weekly summaries:', e);
        }
    }

    function renderWeeklyAnalysis() {
        const data = weeklyData;
        if (!data || !data.length) {
            document.getElementById('vc-state').textContent = 'No History Found';
            document.getElementById('vc-event-list').innerHTML = `
                <div class="glass-panel rounded-2xl p-6 text-center">
                    <span class="material-symbols-outlined text-4xl text-dynamic-variant mb-2">sentiment_dissatisfied</span>
                    <p class="text-sm text-dynamic-variant">No weekly history available yet. Run <code class="bg-black/30 px-1 rounded">node generate-history.js</code> from the project root to seed demo data.</p>
                </div>`;
            return;
        }

        // Aggregate across all days
        const totalFocusMin = data.reduce((s, d) => s + (d.focusMinutes || 0), 0);
        const totalSaves = data.reduce((s, d) => s + (d.saves || 0), 0);
        const totalCommits = data.reduce((s, d) => s + (d.commits || 0), 0);
        const avgLoad = Math.round(data.reduce((s, d) => s + (d.cognitiveLoadAvg || 0), 0) / data.length);
        const langCounts = {};
        data.forEach(d => { if (d.primaryLanguage) langCounts[d.primaryLanguage] = (langCounts[d.primaryLanguage] || 0) + 1; });
        const topLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '--';
        const focusHours = (totalFocusMin / 60).toFixed(1);
        const maxFocus = Math.max(...data.map(d => d.focusMinutes || 0));

        // Hero overwrite
        document.getElementById('vc-state').textContent = `${focusHours}h Focused This Week`;
        document.getElementById('vc-load').textContent = avgLoad;
        document.getElementById('vc-session-min').textContent = totalFocusMin;
        document.getElementById('vc-latest-event').textContent = `${data.length} active days recorded`;
        document.getElementById('vc-source').textContent = '7-Day Firestore Analysis';
        document.getElementById('vc-date-key').textContent = `${data[data.length - 1]?.dateKey || ''} → ${data[0]?.dateKey || ''}`;
        document.getElementById('vc-language').textContent = topLang;

        // Side metrics
        document.getElementById('vc-chars').textContent = totalSaves;
        document.getElementById('vc-switches').textContent = totalCommits;
        document.getElementById('vc-errors').textContent = `${avgLoad}%`;

        // Center Context Map — reuse as KPI grid
        document.getElementById('vc-file').textContent = `${focusHours} hours across ${data.length} days`;
        document.getElementById('vc-time').textContent = data[0]?.dateKey || '--';
        document.getElementById('vc-summary').textContent = `Peak day: ${maxFocus} min. Top language: ${topLang}. ${totalCommits} total commits.`;

        // Raw payload → show daily bar chart as ASCII
        const rawEl = document.getElementById('vc-raw-payload');
        if (rawEl) {
            const chartLines = data.slice().reverse().map(d => {
                const mins = d.focusMinutes || 0;
                const bars = Math.round(mins / 20);
                const bar = '█'.repeat(Math.min(bars, 25)).padEnd(25, '░');
                return `${d.dateKey.slice(5)}  ${bar}  ${mins}m`;
            });
            rawEl.textContent = `── FOCUS HEATMAP (last 7 days) ──\n\n${chartLines.join('\n')}\n\n── COMMITS: ${totalCommits}  SAVES: ${totalSaves}  AVG LOAD: ${avgLoad}% ──`;
        }

        // Timeline — show per-day breakdown cards
        const eventList = document.getElementById('vc-event-list');
        if (eventList) {
            eventList.innerHTML = data.map(d => {
                const focH = (d.focusMinutes / 60).toFixed(1);
                const stateBreak = d.stateBreakdown || {};
                const bugMin = Math.round((stateBreak.bug_hunt || 0));
                const focusChip = `<span class="inline-block bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-semibold">${focH}h Focus</span>`;
                const bugChip = bugMin > 0 ? `<span class="inline-block bg-rose-500/20 text-rose-400 text-[10px] px-2 py-0.5 rounded-full font-semibold">${bugMin}m Bug Fixing</span>` : '';
                const commitChip = d.commits > 0 ? `<span class="inline-block bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded-full font-semibold">${d.commits} Commits</span>` : '';
                const dayLabel = new Date(d.dateKey).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                return `
                    <div class="glass-panel rounded-2xl p-4 border-l-4 border-secondary-dynamic">
                        <div class="flex items-center justify-between gap-3 mb-2">
                            <div class="font-semibold text-dynamic text-sm">${dayLabel}</div>
                            <div class="text-[10px] font-mono text-dynamic-variant">${d.primaryLanguage || '--'}</div>
                        </div>
                        <div class="flex flex-wrap gap-2">${focusChip}${bugChip}${commitChip}</div>
                        <div class="text-[11px] text-dynamic-variant mt-2">${d.saves || 0} saves · Load Avg ${d.cognitiveLoadAvg || 0}%</div>
                    </div>`;
            }).join('');
        }

        updateDialVisual(avgLoad);
    }

    function addFeedCard(payload) {
        const feed = document.getElementById('vscode-activity-feed');
        if (!feed) return;

        const { event: evType, file, timestamp, duration_seconds, char_count, switch_count, error_count, to_state } = payload;
        
        // Silence generic or empty events so they don't pollute the UI as "Activity Pulse"
        if (!evType || evType === 'event') return;

        const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const icon = ICON_MAP[evType] || 'api';
        const title = evType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        let subtext = file ? `File: ${file.split('/').pop()}` : 'Activity Pulse';
        if (evType === 'typing_burst' && duration_seconds) subtext = `${duration_seconds}s burst · ${char_count ?? 0} chars`;
        if (evType === 'editor_switch_velocity') subtext = `${switch_count} switches this minute`;
        if (evType === 'diagnostics_snapshot') subtext = `${error_count ?? 0} errors detected`;
        if (evType === 'focus_state_changed' && to_state) subtext = `→ ${to_state.replace('_', ' ')}`;

        const card = document.createElement('div');
        card.className = 'glass-panel rounded-lg p-3 flex items-center gap-3 border-l-4 border-secondary-dynamic transition-all';
        card.innerHTML = `
            <span class="material-symbols-outlined text-secondary-dynamic text-lg shrink-0">${icon}</span>
            <div class="min-w-0 flex-1">
                <div class="flex justify-between items-baseline gap-2">
                    <span class="text-sm font-semibold text-dynamic truncate">${title}</span>
                    <span class="text-[10px] text-dynamic-variant shrink-0">${timeStr}</span>
                </div>
                <p class="text-xs text-dynamic-variant truncate">${subtext}</p>
            </div>
        `;

        feed.prepend(card);
        if (feed.children.length > 5) feed.removeChild(feed.lastChild);
    }

    ipcRenderer.on('vscode-event', (_, payload) => {
        const snap = analytics.processEvent(payload);
        updateVsCodeContextState(payload, snap);
        addFeedCard(payload);
        updateCognitiveUI(snap);
    });

    // 5. Email Task Intelligence Notifications
    let notificationsHistory = [];

    const PRIORITY_STYLES = {
        'Urgent': { bg: 'bg-red-500/10', border: 'border-red-500', text: 'text-red-500', icon: 'priority_high' },
        'High':   { bg: 'bg-orange-500/10', border: 'border-orange-500', text: 'text-orange-500', icon: 'error' },
        'Medium': { bg: 'bg-yellow-500/10', border: 'border-yellow-500', text: 'text-yellow-500', icon: 'warning' },
        'Low':    { bg: 'bg-blue-500/10', border: 'border-blue-500', text: 'text-blue-500', icon: 'info' }
    };

    function renderEmailNotification(data, index) {
        const { email, analysis, timestamp } = data;
        const style = PRIORITY_STYLES[analysis.priority] || PRIORITY_STYLES['Low'];
        const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return `
            <div class="glass-panel rounded-2xl p-5 border-l-4 ${style.border} flex flex-col hover:translate-x-1 transition-all">
                <div class="flex items-start gap-4">
                    <div class="w-10 h-10 rounded-full ${style.bg} ${style.text} flex items-center justify-center shrink-0 mt-1">
                        <span class="material-symbols-outlined text-sm">${style.icon}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center mb-1">
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-bold uppercase tracking-widest ${style.text}">${analysis.priority}</span>
                                <span class="text-[10px] text-dynamic-variant opacity-50">•</span>
                                <span class="text-[10px] text-dynamic-variant uppercase tracking-widest font-bold">${analysis.sender || email.from.split('<')[0].trim()}</span>
                            </div>
                            <span class="text-[10px] text-dynamic-variant font-medium">${timeStr}</span>
                        </div>
                        <h4 class="font-bold text-dynamic text-sm truncate mb-1">${analysis.task}</h4>
                        <p class="text-xs text-dynamic-variant leading-relaxed opacity-80 italic line-clamp-1">"${email.subject}"</p>
                        ${analysis.deadline !== 'None' ? `<div class="mt-2 text-[10px] font-bold text-red-400 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">calendar_today</span> Due: ${analysis.deadline}</div>` : ''}
                        
                        <div class="mt-3">
                            <button data-index="${index}" class="reply-btn text-[11px] px-3 py-1.5 bg-[var(--surface-high)] border border-[var(--outline-var)] rounded-md text-dynamic-variant hover:text-white hover:bg-primary-dynamic hover:border-primary-dynamic transition-all font-bold flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px]">reply</span> Reply
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    let currentReplyContext = null;

    function openReplyModal(notificationData) {
        const { email, analysis } = notificationData;
        currentReplyContext = notificationData;

        // The AI might just extract the human name (e.g. "John Doe") for analysis.sender.
        // We MUST use the raw Gmail header (email.from) which contains the actual address.
        const rawFromHeader = email.from || "";
        const toEmailMatch = rawFromHeader.match(/<([^>]+)>/);
        let toEmail = toEmailMatch ? toEmailMatch[1] : rawFromHeader;
        
        // Clean up any stray quotes or extra spaces
        toEmail = toEmail.replace(/["']/g, '').trim();
        
        document.getElementById('reply-to-address').textContent = toEmail;
        document.getElementById('reply-subject').value = email.subject.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email.subject}`;
        document.getElementById('reply-content').value = '';
        
        // Show original message
        const replyBg = document.getElementById('reply-original-body');
        const snippetText = email.fullContent ? email.fullContent.trim() : email.snippet;
        replyBg.textContent = snippetText || "(No content available)";
        
        document.getElementById('reply-modal').classList.remove('hidden');
    }

    function closeReplyModal() {
        document.getElementById('reply-modal').classList.add('hidden');
        currentReplyContext = null;
    }

    function updateNotificationsView() {
        const list = document.getElementById('email-notifications-list');
        const emptyState = document.getElementById('notifications-empty');
        if (!list) return;

        if (notificationsHistory.length > 0) {
            if (emptyState) emptyState.style.display = 'none';
            const html = notificationsHistory.map((n, i) => renderEmailNotification(n, i)).join('');
            
            // Remove previous children except empty state
            Array.from(list.children).forEach(c => {
                 if (c.id !== 'notifications-empty') c.remove();
            });
            list.insertAdjacentHTML('beforeend', html);

            // Attach event listeners to reply buttons
            document.querySelectorAll('.reply-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = e.currentTarget.getAttribute('data-index');
                    if (notificationsHistory[idx]) {
                        openReplyModal(notificationsHistory[idx]);
                    }
                });
            });

        } else {
            // Remove previous children except empty state
            Array.from(list.children).forEach(c => {
                 if (c.id !== 'notifications-empty') c.remove();
            });
            if (emptyState) emptyState.style.display = 'flex';
        }
    }

    ipcRenderer.on('new-email-notification', (_, data) => {
        notificationsHistory.unshift(data);
        if (notificationsHistory.length > 50) notificationsHistory.pop();
        updateNotificationsView();
        // Also update Unified Inbox email tab if it's visible
        updateInboxEmailTab();
        updateInboxBadges();
    });

    // ══════════════════════════════════════════════════════════
    // 6. WhatsApp Unified Inbox
    // ══════════════════════════════════════════════════════════
    let whatsappHistory = [];
    let currentWaReplyContext = null;   // { msg, analysis, timestamp }
    let currentEmailInboxContext = null; // For email reply from Unified Inbox

    const WA_PRIORITY_STYLES = {
        'High':   { dotClass: 'priority-dot-high',   textClass: 'priority-text-high',   borderClass: 'priority-high',   icon: '🔴', label: 'HIGH' },
        'Medium': { dotClass: 'priority-dot-medium', textClass: 'priority-text-medium', borderClass: 'priority-medium', icon: '🟡', label: 'MED' },
        'Low':    { dotClass: 'priority-dot-low',    textClass: 'priority-text-low',    borderClass: 'priority-low',    icon: '🔵', label: 'LOW' },
    };

    function renderWhatsAppCard(data, index) {
        const { msg, analysis, timestamp } = data;
        const style = WA_PRIORITY_STYLES[analysis.priority] || WA_PRIORITY_STYLES['Medium'];
        const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const preview = (msg.body || '').substring(0, 120) + ((msg.body || '').length > 120 ? '...' : '');
        return `
            <div class="glass-panel rounded-2xl p-5 border-l-4 ${style.borderClass} flex flex-col hover:translate-x-1 transition-all gap-3">
                <div class="flex items-start gap-4">
                    <div class="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 mt-0.5 text-lg">
                        💬
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center mb-1">
                            <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full ${style.dotClass} shrink-0"></span>
                                <span class="text-[10px] font-bold uppercase tracking-widest ${style.textClass}">${style.label}</span>
                                <span class="text-[10px] text-dynamic-variant opacity-50">•</span>
                                <span class="text-[10px] text-dynamic-variant uppercase tracking-widest font-bold">${analysis.sender || msg.contact || 'Unknown'}</span>
                            </div>
                            <span class="text-[10px] text-dynamic-variant font-medium">${timeStr}</span>
                        </div>
                        <h4 class="font-bold text-dynamic text-sm truncate mb-1">${analysis.task || 'Message received'}</h4>
                        <p class="text-xs text-dynamic-variant leading-relaxed opacity-70 italic line-clamp-2">&ldquo;${preview}&rdquo;</p>
                    </div>
                </div>
                <div class="flex items-center justify-between pl-14">
                    <button data-wa-index="${index}" class="wa-reply-btn text-[11px] px-3 py-1.5 bg-[var(--surface-high)] border border-[var(--outline-var)] rounded-md text-dynamic-variant hover:text-white hover:bg-green-600 hover:border-green-600 transition-all font-bold flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">reply</span> Reply
                    </button>
                </div>
            </div>
        `;
    }

    function renderInboxEmailCard(data, index) {
        const { email, analysis, timestamp } = data;
        const style = PRIORITY_STYLES[analysis.priority] || PRIORITY_STYLES['Low'];
        const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="glass-panel rounded-2xl p-5 border-l-4 ${style.border} flex flex-col hover:translate-x-1 transition-all gap-3">
                <div class="flex items-start gap-4">
                    <div class="w-10 h-10 rounded-full ${style.bg} ${style.text} flex items-center justify-center shrink-0 mt-0.5">
                        <span class="material-symbols-outlined text-sm">${style.icon}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center mb-1">
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-bold uppercase tracking-widest ${style.text}">${analysis.priority}</span>
                                <span class="text-[10px] text-dynamic-variant opacity-50">•</span>
                                <span class="text-[10px] text-dynamic-variant uppercase tracking-widest font-bold">${analysis.sender || email.from.split('<')[0].trim()}</span>
                            </div>
                            <span class="text-[10px] text-dynamic-variant font-medium">${timeStr}</span>
                        </div>
                        <h4 class="font-bold text-dynamic text-sm truncate mb-1">${analysis.task}</h4>
                        <p class="text-xs text-dynamic-variant leading-relaxed opacity-70 italic line-clamp-1">&ldquo;${email.subject}&rdquo;</p>
                        ${analysis.deadline !== 'None' ? `<div class="mt-1 text-[10px] font-bold text-red-400 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">calendar_today</span> Due: ${analysis.deadline}</div>` : ''}
                    </div>
                </div>
                <div class="pl-14">
                    <button data-inbox-email-index="${index}" class="inbox-email-reply-btn text-[11px] px-3 py-1.5 bg-[var(--surface-high)] border border-[var(--outline-var)] rounded-md text-dynamic-variant hover:text-white hover:bg-primary-dynamic hover:border-primary-dynamic transition-all font-bold flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">reply</span> Reply
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Called whenever whatsappHistory changes. Refreshes the WhatsApp tab if inbox is loaded.
     */
    function updateInboxWaTab() {
        const list = document.getElementById('inbox-wa-list');
        const empty = document.getElementById('inbox-wa-empty');
        if (!list) return;

        Array.from(list.children).forEach(c => { if (c.id !== 'inbox-wa-empty') c.remove(); });

        if (whatsappHistory.length > 0) {
            if (empty) empty.style.display = 'none';

            // Group by priority
            const highMsgs = whatsappHistory.map((d, i) => ({d, i})).filter(x => x.d.analysis.priority === 'High');
            const medMsgs = whatsappHistory.map((d, i) => ({d, i})).filter(x => x.d.analysis.priority === 'Medium');
            const lowMsgs = whatsappHistory.map((d, i) => ({d, i})).filter(x => x.d.analysis.priority === 'Low');

            let html = '';
            if (highMsgs.length > 0) {
                html += '<h3 class="text-xs font-bold uppercase text-red-400 mb-3 mt-4 ml-1 flex items-center gap-2 border-b border-red-500/20 pb-2"><span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>High Priority</h3>';
                html += highMsgs.map(x => renderWhatsAppCard(x.d, x.i)).join('');
            }
            if (medMsgs.length > 0) {
                html += '<h3 class="text-xs font-bold uppercase text-yellow-500 mb-3 mt-6 ml-1 flex items-center gap-2 border-b border-yellow-500/20 pb-2">Medium Priority</h3>';
                html += medMsgs.map(x => renderWhatsAppCard(x.d, x.i)).join('');
            }
            if (lowMsgs.length > 0) {
                html += '<h3 class="text-xs font-bold uppercase text-dynamic-variant opacity-70 mb-3 mt-6 ml-1 flex items-center gap-2 border-b border-[var(--outline-var)] pb-2">Low Priority</h3>';
                html += lowMsgs.map(x => renderWhatsAppCard(x.d, x.i)).join('');
            }

            list.insertAdjacentHTML('beforeend', html);
            
            list.querySelectorAll('.wa-reply-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.getAttribute('data-wa-index'));
                    openWaReplyModal(whatsappHistory[idx]);
                });
            });
        } else {
            if (empty) empty.style.display = 'flex';
        }
    }

    /**
     * Refreshes the Email tab inside Unified Inbox.
     */
    function updateInboxEmailTab() {
        const list = document.getElementById('inbox-email-list');
        const empty = document.getElementById('inbox-email-empty');
        if (!list) return;

        Array.from(list.children).forEach(c => { if (c.id !== 'inbox-email-empty') c.remove(); });

        if (notificationsHistory.length > 0) {
            if (empty) empty.style.display = 'none';

            // Group by priority
            const urgentMsgs = notificationsHistory.map((d, i) => ({d, i})).filter(x => x.d.analysis.priority === 'Urgent');
            const highMsgs = notificationsHistory.map((d, i) => ({d, i})).filter(x => x.d.analysis.priority === 'High');
            const medMsgs = notificationsHistory.map((d, i) => ({d, i})).filter(x => x.d.analysis.priority === 'Medium');
            const lowMsgs = notificationsHistory.map((d, i) => ({d, i})).filter(x => x.d.analysis.priority === 'Low');

            let html = '';
            if (urgentMsgs.length > 0) {
                html += '<h3 class="text-xs font-bold uppercase text-red-500 mb-3 mt-4 ml-1 flex items-center gap-2 border-b border-red-500/20 pb-2"><span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>Urgent Priority</h3>';
                html += urgentMsgs.map(x => renderInboxEmailCard(x.d, x.i)).join('');
            }
            if (highMsgs.length > 0) {
                html += '<h3 class="text-xs font-bold uppercase text-orange-400 mb-3 mt-6 ml-1 flex items-center gap-2 border-b border-orange-500/20 pb-2"><span class="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>High Priority</h3>';
                html += highMsgs.map(x => renderInboxEmailCard(x.d, x.i)).join('');
            }
            if (medMsgs.length > 0) {
                html += '<h3 class="text-xs font-bold uppercase text-yellow-500 mb-3 mt-6 ml-1 flex items-center gap-2 border-b border-yellow-500/20 pb-2">Medium Priority</h3>';
                html += medMsgs.map(x => renderInboxEmailCard(x.d, x.i)).join('');
            }
            if (lowMsgs.length > 0) {
                html += '<h3 class="text-xs font-bold uppercase text-dynamic-variant opacity-70 mb-3 mt-6 ml-1 flex items-center gap-2 border-b border-[var(--outline-var)] pb-2">Low Priority</h3>';
                html += lowMsgs.map(x => renderInboxEmailCard(x.d, x.i)).join('');
            }

            list.insertAdjacentHTML('beforeend', html);

            list.querySelectorAll('.inbox-email-reply-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.getAttribute('data-inbox-email-index'));
                    openInboxEmailReplyModal(notificationsHistory[idx]);
                });
            });
        } else {
            if (empty) empty.style.display = 'flex';
        }
    }

    /** Updates the count badges on the tabs. */
    function updateInboxBadges() {
        const emailBadge = document.getElementById('email-badge');
        const waBadge = document.getElementById('wa-badge');
        if (emailBadge) {
            emailBadge.textContent = notificationsHistory.length;
            emailBadge.classList.toggle('hidden', notificationsHistory.length === 0);
        }
        if (waBadge) {
            waBadge.textContent = whatsappHistory.length;
            waBadge.classList.toggle('hidden', whatsappHistory.length === 0);
        }
    }

    /** Opens the WhatsApp reply modal. */
    function openWaReplyModal(data) {
        currentWaReplyContext = data;
        const toEl = document.getElementById('inbox-wa-reply-to');
        const originalEl = document.getElementById('inbox-wa-original-body');
        const contentEl = document.getElementById('inbox-wa-reply-content');
        if (toEl) toEl.textContent = data.msg.contact || data.msg.from;
        if (originalEl) originalEl.textContent = data.msg.body || '';
        if (contentEl) contentEl.value = '';
        document.getElementById('inbox-wa-reply-modal')?.classList.remove('hidden');
    }

    function closeWaReplyModal() {
        document.getElementById('inbox-wa-reply-modal')?.classList.add('hidden');
        currentWaReplyContext = null;
    }

    /** Opens the email reply modal inside Unified Inbox. */
    function openInboxEmailReplyModal(data) {
        currentEmailInboxContext = data;
        const { email, analysis } = data;
        const rawFrom = email.from || '';
        const match = rawFrom.match(/<([^>]+)>/);
        let toEmail = match ? match[1] : rawFrom;
        toEmail = toEmail.replace(/["']/g, '').trim();

        const toEl = document.getElementById('inbox-email-reply-to');
        const subjectEl = document.getElementById('inbox-email-reply-subject');
        const bodyEl = document.getElementById('inbox-email-original-body');
        const contentEl = document.getElementById('inbox-email-reply-content');

        if (toEl) toEl.textContent = toEmail;
        if (subjectEl) subjectEl.value = email.subject.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email.subject}`;
        if (bodyEl) bodyEl.textContent = email.fullContent ? email.fullContent.trim() : (email.snippet || '(No content available)');
        if (contentEl) contentEl.value = '';
        document.getElementById('inbox-email-reply-modal')?.classList.remove('hidden');
    }

    function closeInboxEmailReplyModal() {
        document.getElementById('inbox-email-reply-modal')?.classList.add('hidden');
        currentEmailInboxContext = null;
    }

    // ── IPC: Receive incoming WhatsApp messages ──
    ipcRenderer.on('new-whatsapp-message', (_, data) => {
        whatsappHistory.unshift(data);
        if (whatsappHistory.length > 50) whatsappHistory.pop();
        // Update WhatsApp status dot to connected when first message arrives
        const dot = document.getElementById('wa-status-dot');
        const txt = document.getElementById('wa-status-text');
        if (dot) { dot.classList.remove('bg-yellow-500'); dot.classList.add('bg-green-500'); }
        if (txt) txt.textContent = 'Connected';
        updateInboxWaTab();
        updateInboxBadges();
    });

    // Modified attachViewListeners to include notifications view logic
    const originalAttachViewListeners = attachViewListeners;
    attachViewListeners = (viewName) => {
        originalAttachViewListeners(viewName);

        if (viewName === 'notifications') {
            updateNotificationsView();

            const clearBtn = document.getElementById('clear-notifications');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    notificationsHistory = [];
                    updateNotificationsView();
                });
            }

            const liveFeedBtn = document.getElementById('live-feed-btn');
            if (liveFeedBtn) {
                liveFeedBtn.addEventListener('click', async () => {
                    const originalText = liveFeedBtn.innerHTML;
                    liveFeedBtn.innerHTML = `<span class="material-symbols-outlined text-[14px] animate-spin">refresh</span> Syncing...`;
                    liveFeedBtn.classList.add('opacity-70', 'pointer-events-none');
                    try {
                        await ipcRenderer.invoke('force-email-sync');
                        await new Promise(r => setTimeout(r, 1000));
                    } catch (e) {
                        console.error(e);
                    } finally {
                        liveFeedBtn.innerHTML = originalText;
                        liveFeedBtn.classList.remove('opacity-70', 'pointer-events-none');
                    }
                });
            }

            // Modal Listeners
            document.getElementById('close-reply-modal')?.addEventListener('click', closeReplyModal);
            document.getElementById('cancel-reply-btn')?.addEventListener('click', closeReplyModal);

            const sendBtn = document.getElementById('send-reply-btn');
            if (sendBtn) {
                const newSendBtn = sendBtn.cloneNode(true);
                sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
                newSendBtn.addEventListener('click', async () => {
                    if (!currentReplyContext) return;
                    const to = document.getElementById('reply-to-address').textContent.trim();
                    const subject = document.getElementById('reply-subject').value;
                    const userReplyText = document.getElementById('reply-content').value;
                    if (!userReplyText.trim()) return;
                    newSendBtn.innerText = 'Sending...';
                    newSendBtn.classList.add('opacity-50', 'pointer-events-none');
                    const originalEmailText = currentReplyContext.email.fullContent || currentReplyContext.email.snippet;
                    const fullContent = `${userReplyText}\n\nOn ${new Date().toLocaleString()}, ${to} wrote:\n> ${originalEmailText.replace(/\n/g, '\n> ')}`;
                    try {
                        const res = await ipcRenderer.invoke('send-email-reply', {
                            to, subject: subject.trim(), content: fullContent,
                            threadId: currentReplyContext.email.threadId,
                            messageId: currentReplyContext.email.messageId
                        });
                        if (res.success) { closeReplyModal(); } else { alert('Failed to send: ' + res.error); }
                    } catch (e) {
                        console.error(e);
                        alert('Error sending reply.');
                    } finally {
                        newSendBtn.innerHTML = `<span class="material-symbols-outlined text-[14px]">send</span> Send Reference Task`;
                        newSendBtn.classList.remove('opacity-50', 'pointer-events-none');
                    }
                });
            }
        }

        // ── Unified Inbox View ──
        if (viewName === 'unified-inbox') {
            // Populate both tabs
            updateInboxEmailTab();
            updateInboxWaTab();
            updateInboxBadges();

            // Tab switching
            document.querySelectorAll('.inbox-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.inbox-tab-btn').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.inbox-panel').forEach(p => p.classList.add('hidden'));
                    btn.classList.add('active');
                    const tab = btn.getAttribute('data-inbox-tab');
                    document.getElementById(`inbox-panel-${tab}`)?.classList.remove('hidden');
                });
            });

            // Sync Inbox button
            const syncBtn = document.getElementById('inbox-sync-btn');
            if (syncBtn) {
                syncBtn.addEventListener('click', async () => {
                    const orig = syncBtn.innerHTML;
                    syncBtn.innerHTML = `<span class="material-symbols-outlined text-[14px] animate-spin">sync</span> Syncing...`;
                    syncBtn.classList.add('opacity-70', 'pointer-events-none');
                    try { 
                        // Force email poll; WhatsApp is push-based so we just re-render
                        await ipcRenderer.invoke('force-email-sync'); 
                        await new Promise(r => setTimeout(r, 1000)); 
                        updateInboxEmailTab();
                        updateInboxWaTab();
                        updateInboxBadges();
                    }
                    catch (e) { console.error(e); }
                    finally { syncBtn.innerHTML = orig; syncBtn.classList.remove('opacity-70', 'pointer-events-none'); }
                });
            }

            // Clear all button
            const clearBtn = document.getElementById('inbox-clear-btn');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    notificationsHistory = [];
                    whatsappHistory = [];
                    updateInboxEmailTab();
                    updateInboxWaTab();
                    updateInboxBadges();
                });
            }

            // ── Email Reply Modal (Unified Inbox) ──
            document.getElementById('inbox-email-modal-close')?.addEventListener('click', closeInboxEmailReplyModal);
            document.getElementById('inbox-email-modal-cancel')?.addEventListener('click', closeInboxEmailReplyModal);

            const inboxEmailSend = document.getElementById('inbox-email-modal-send');
            if (inboxEmailSend) {
                const newBtn = inboxEmailSend.cloneNode(true);
                inboxEmailSend.parentNode.replaceChild(newBtn, inboxEmailSend);
                newBtn.addEventListener('click', async () => {
                    if (!currentEmailInboxContext) return;
                    const to = document.getElementById('inbox-email-reply-to').textContent.trim();
                    const subject = document.getElementById('inbox-email-reply-subject').value;
                    const userReplyText = document.getElementById('inbox-email-reply-content').value;
                    if (!userReplyText.trim()) return;
                    newBtn.innerHTML = `<span class="material-symbols-outlined text-[14px]">hourglass_top</span> Sending...`;
                    newBtn.classList.add('opacity-60', 'pointer-events-none');
                    const originalEmailText = currentEmailInboxContext.email.fullContent || currentEmailInboxContext.email.snippet;
                    const fullContent = `${userReplyText}\n\nOn ${new Date().toLocaleString()}, ${to} wrote:\n> ${originalEmailText.replace(/\n/g, '\n> ')}`;
                    try {
                        const res = await ipcRenderer.invoke('send-email-reply', {
                            to, subject: subject.trim(), content: fullContent,
                            threadId: currentEmailInboxContext.email.threadId,
                            messageId: currentEmailInboxContext.email.messageId
                        });
                        if (res.success) { closeInboxEmailReplyModal(); } else { alert('Failed: ' + res.error); }
                    } catch (e) { console.error(e); alert('Error sending email reply.'); }
                    finally {
                        newBtn.innerHTML = `<span class="material-symbols-outlined text-[14px]">send</span> Send Email`;
                        newBtn.classList.remove('opacity-60', 'pointer-events-none');
                    }
                });
            }

            // ── WhatsApp Reply Modal ──
            document.getElementById('inbox-wa-modal-close')?.addEventListener('click', closeWaReplyModal);
            document.getElementById('inbox-wa-modal-cancel')?.addEventListener('click', closeWaReplyModal);

            const waSendBtn = document.getElementById('inbox-wa-modal-send');
            if (waSendBtn) {
                const newWaBtn = waSendBtn.cloneNode(true);
                waSendBtn.parentNode.replaceChild(newWaBtn, waSendBtn);
                newWaBtn.addEventListener('click', async () => {
                    if (!currentWaReplyContext) return;
                    const text = document.getElementById('inbox-wa-reply-content').value.trim();
                    if (!text) return;
                    newWaBtn.innerHTML = `<span class="material-symbols-outlined text-[14px]">hourglass_top</span> Sending...`;
                    newWaBtn.classList.add('opacity-60', 'pointer-events-none');
                    try {
                        const res = await ipcRenderer.invoke('send-whatsapp-reply', {
                            chatId: currentWaReplyContext.msg.from,
                            text
                        });
                        if (res.success) { closeWaReplyModal(); } else { alert('Failed: ' + res.error); }
                    } catch (e) { console.error(e); alert('Error sending WhatsApp reply.'); }
                    finally {
                        newWaBtn.innerHTML = `<span class="material-symbols-outlined text-[14px]">send</span> Send via WhatsApp`;
                        newWaBtn.classList.remove('opacity-60', 'pointer-events-none');
                    }
                });
            }
        } else if (viewName === 'rules') {
            const rulesContainer = document.getElementById('rules-container');
            if (rulesContainer) {
                // Fetch current config and render
                ipcRenderer.invoke('get-context-rules').then(rules => {
                    renderRules(rules, rulesContainer);
                });
            }
        }
    }

    function renderRules(rules, container) {
        container.innerHTML = '';
        rules.forEach(rule => {
            const isActive = rule.active;
            const opacityClass = isActive ? 'opacity-100' : 'opacity-70 hover:opacity-100';
            const statusColor = isActive ? 'text-primary-dynamic' : 'text-dynamic-variant';
            const btnClass = isActive 
                ? 'bg-primary-dynamic text-white border-primary-dynamic' 
                : 'bg-transparent border-dynamic text-dynamic hover:bg-[var(--surface-higher)]';
            const btnText = isActive ? 'Active' : 'Inactive';

            const card = document.createElement('div');
            card.className = `glass-panel p-6 rounded-xl space-y-4 transition-all duration-300 ${opacityClass}`;
            card.innerHTML = `
                <div class="flex items-center justify-between border-b border-dynamic pb-4">
                    <div>
                        <h4 class="font-bold text-dynamic">${rule.title}</h4>
                        <p class="text-sm text-dynamic-variant mt-1">${rule.description}</p>
                    </div>
                </div>
                <div class="flex justify-between items-center pt-2">
                    <span class="text-xs font-medium ${statusColor}">System hooked</span>
                    <button class="rule-toggle-btn px-4 py-1.5 border rounded-full text-xs font-bold transition-colors ${btnClass}" data-id="${rule.id}">
                        ${btnText}
                    </button>
                </div>
            `;
            container.appendChild(card);
        });

        // Attach listeners to new buttons
        document.querySelectorAll('.rule-toggle-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const ruleId = e.target.getAttribute('data-id');
                // Optimistic UI could go here, but let's re-render from backend truth
                const updatedRules = await ipcRenderer.invoke('toggle-rule', ruleId);
                renderRules(updatedRules, container);
            });
        });
    }

    // ══════════════════════════════════════════════════════════
    // 7. Browser Intelligence (WebExtension WebSocket Bridge)
    // ══════════════════════════════════════════════════════════

    // ── In-memory state ──
    let biConnected = false;
    let biLatestVector = null;
    let biLatestContext = null;
    let biStateHistory = [];          // { state, ts, domain } — last 60 events
    let biDomainTimeMap = {};         // { domain: { ms, category } }
    let biDomainLastSeen = {};        // { domain: ts } — for accumulation
    let biHourlyFocusMap = {};        // { 'HH': totalActiveFocusMs }
    let biNotifFeed = [];             // last 20 NOTIFICATION_DECISION payloads
    let biScrollDepthHistory = [];    // last 30 avgScrollDepth snapshots
    let biViewActive = false;
    let biRefreshTimer = null;

    const BI_STATE_STYLES = {
        active_focus:  { label: 'Active Focus',  icon: 'bolt',         bg: 'bg-emerald-500/10', text: 'text-emerald-400',  bar: '#10b981', timelineBg: 'bg-emerald-500' },
        passive_focus: { label: 'Passive Focus', icon: 'visibility',   bg: 'bg-blue-500/10',    text: 'text-blue-400',    bar: '#60a5fa', timelineBg: 'bg-blue-400' },
        distracted:    { label: 'Distracted',    icon: 'warning',      bg: 'bg-rose-500/10',    text: 'text-rose-400',    bar: '#f43f5e', timelineBg: 'bg-rose-500' },
        idle:          { label: 'Idle',          icon: 'hourglass_top',bg: 'bg-gray-500/10',    text: 'text-gray-400',    bar: '#6b7280', timelineBg: 'bg-gray-500' },
        transitioning: { label: 'Transitioning', icon: 'refresh',      bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  bar: '#f59e0b', timelineBg: 'bg-yellow-500' },
    };

    const CATEGORY_COLORS = {
        productivity: 'bg-indigo-500',
        communication: 'bg-sky-500',
        media: 'bg-rose-500',
        social: 'bg-amber-500',
        neutral: 'bg-slate-500',
        unknown: 'bg-zinc-600',
    };

    // ── Helpers ──
    function msToDuration(ms) {
        const s = Math.round(ms / 1000);
        if (s < 60) return `${s}s`;
        const m = Math.round(s / 60);
        if (m < 60) return `${m}m`;
        return `${Math.floor(m / 60)}h ${m % 60}m`;
    }

    function formatHour(h) {
        const ampm = h < 12 ? 'AM' : 'PM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}${ampm}`;
    }

    function getWorkMode(mix) {
        if (!mix) return '–';
        const entries = Object.entries(mix).sort((a, b) => b[1] - a[1]);
        const top = entries[0]?.[0];
        const modes = { keydown: '⌨ Coding/Writing', scroll: '📖 Reading/Research', mousemove: '🖱 Browsing', click: '🔗 Navigating' };
        return modes[top] || '–';
    }

    // ── State accumulation ──
    function biIngestStateChange(payload) {
        const state = payload.state?.state || payload.state;
        const domain = payload.state?.currentDomain || payload.vector?.currentDomain || null;
        const ts = payload.emittedAt || Date.now();

        // Update state history
        biStateHistory.push({ state, ts, domain });
        if (biStateHistory.length > 60) biStateHistory.shift();

        // Accumulate hourly focus map
        if (state === 'active_focus') {
            const hour = new Date(ts).getHours();
            const key = String(hour).padStart(2, '0');
            // Estimate ~30s per pipeline update for time credit
            biHourlyFocusMap[key] = (biHourlyFocusMap[key] || 0) + 30000;
        }

        biLatestContext = payload.state || {};
        if (payload.vector) biLatestVector = payload.vector;
    }

    function biIngestPipelineUpdate(payload) {
        const vector = payload.vector || {};
        const context = payload.contextState || {};
        biLatestVector = vector;
        biLatestContext = { ...biLatestContext, ...context };

        // Accumulate domain time
        const domain = vector.currentDomain;
        if (domain && vector.timeOnCurrentDomainMs > 0) {
            if (!biDomainTimeMap[domain]) {
                biDomainTimeMap[domain] = { ms: 0, category: vector.domainCategory || 'neutral' };
            }
            // Only add delta since last seen to avoid double-counting
            const prev = biDomainLastSeen[domain] || 0;
            const now = Date.now();
            if (prev > 0) {
                const delta = Math.min(now - prev, 30000); // cap at 30s per tick
                biDomainTimeMap[domain].ms += delta;
            }
            biDomainLastSeen[domain] = now;
            biDomainTimeMap[domain].category = vector.domainCategory || biDomainTimeMap[domain].category;
        }

        // Accumulate scroll depth history
        if (vector.avgScrollDepth !== undefined) {
            biScrollDepthHistory.push(vector.avgScrollDepth);
            if (biScrollDepthHistory.length > 30) biScrollDepthHistory.shift();
        }
    }

    function biIngestNotifDecision(payload) {
        biNotifFeed.unshift({ ...payload, receivedAt: Date.now() });
        if (biNotifFeed.length > 20) biNotifFeed.pop();
    }

    // ── Render panels ──
    function biRenderKpis() {
        const v = biLatestVector || {};
        const c = biLatestContext || {};

        // Focus Score
        const score = Math.round((v.focusScore || c.focusScore || 0) * 100);
        const scoreEl = document.getElementById('bi-focus-score');
        const scoreBar = document.getElementById('bi-focus-bar');
        if (scoreEl) scoreEl.textContent = score ? `${score}%` : '–';
        if (scoreBar) scoreBar.style.width = `${score}%`;

        // State
        const state = c.state || 'transitioning';
        const style = BI_STATE_STYLES[state] || BI_STATE_STYLES.transitioning;
        const stateLabel = document.getElementById('bi-state-label');
        const stateIcon = document.getElementById('bi-state-icon');
        const stateWrap = document.getElementById('bi-state-icon-wrap');
        const domainEl = document.getElementById('bi-current-domain');
        const stateAgeEl = document.getElementById('bi-state-age');
        if (stateLabel) stateLabel.textContent = style.label;
        if (stateIcon) { stateIcon.textContent = style.icon; stateIcon.className = `material-symbols-outlined text-lg ${style.text}`; }
        if (stateWrap) stateWrap.className = `w-10 h-10 rounded-xl flex items-center justify-center ${style.bg}`;
        if (domainEl) domainEl.textContent = c.currentDomain || v.currentDomain || 'No domain';
        if (stateAgeEl) stateAgeEl.textContent = c.stateAgeMs ? `State age: ${msToDuration(c.stateAgeMs)}` : '';

        // Tab switch
        const switchEl = document.getElementById('bi-switch-rate');
        const switch5mEl = document.getElementById('bi-switch-rate-5m');
        const switchLabelEl = document.getElementById('bi-switch-label');
        const rate1m = v.tabSwitchRate1m ?? '–';
        if (switchEl) switchEl.textContent = rate1m;
        if (switch5mEl) switch5mEl.textContent = v.tabSwitchRate5m ?? '–';
        if (switchLabelEl) {
            const r = Number(rate1m);
            switchLabelEl.textContent = r >= 6 ? 'High distraction' : r >= 3 ? 'Moderate' : r > 0 ? 'Low distraction' : '–';
        }
    }

    function biRenderTimeline() {
        const container = document.getElementById('bi-timeline');
        const empty = document.getElementById('bi-timeline-empty');
        if (!container) return;

        // Show last 30 events
        const slice = biStateHistory.slice(-30);
        if (slice.length === 0) {
            container.innerHTML = '';
            if (empty) empty.style.display = 'block';
            return;
        }
        if (empty) empty.style.display = 'none';

        const total = slice.length;
        container.innerHTML = slice.map(({ state }, i) => {
            const s = BI_STATE_STYLES[state] || BI_STATE_STYLES.transitioning;
            const width = Math.max(2, Math.round((1 / total) * 100));
            const title = s.label;
            return `<div title="${title}" class="h-full ${s.timelineBg} flex-1 min-w-[4px]" style="flex-basis:${width}%"></div>`;
        }).join('');

        // Peak focus time
        biRenderPeakFocusTime();
    }

    function biRenderPeakFocusTime() {
        const peakEl = document.getElementById('bi-peak-focus-text');
        const peakSub = document.getElementById('bi-peak-focus-sub');
        if (!peakEl) return;

        const entries = Object.entries(biHourlyFocusMap);
        if (entries.length === 0) {
            peakEl.textContent = 'Not enough data yet';
            if (peakSub) peakSub.textContent = '';
            return;
        }

        // Sort by total active focus ms
        entries.sort((a, b) => b[1] - a[1]);
        const [bestHour, bestMs] = entries[0];
        const hour = parseInt(bestHour, 10);
        const endHour = (hour + 1) % 24;

        peakEl.textContent = `${formatHour(hour)} – ${formatHour(endHour)}`;
        if (peakSub) peakSub.textContent = `${msToDuration(bestMs)} of active focus`;
    }

    function biRenderDomainList() {
        const list = document.getElementById('bi-domain-list');
        if (!list) return;

        const entries = Object.entries(biDomainTimeMap)
            .filter(([, v]) => v.ms > 2000)
            .sort((a, b) => b[1].ms - a[1].ms)
            .slice(0, 8);

        if (entries.length === 0) {
            list.innerHTML = '<p class="text-xs text-dynamic-variant text-center py-2">Active sites will appear here…</p>';
            return;
        }

        const maxMs = entries[0][1].ms;
        list.innerHTML = entries.map(([domain, { ms, category }]) => {
            const pct = Math.round((ms / maxMs) * 100);
            const barClass = CATEGORY_COLORS[category] || CATEGORY_COLORS.neutral;
            return `
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[11px] font-medium text-dynamic truncate max-w-[160px]" title="${domain}">${domain}</span>
                        <span class="text-[10px] text-dynamic-variant shrink-0 ml-2">${msToDuration(ms)}</span>
                    </div>
                    <div class="w-full bg-[var(--surface-high)] rounded-full h-1.5 overflow-hidden">
                        <div class="h-full rounded-full ${barClass} transition-all duration-500" style="width:${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function biRenderModality() {
        const mix = biLatestVector?.inputModalityMix;
        const toEl = (id, pct) => {
            const bar = document.getElementById(id);
            const label = document.getElementById(`${id}-pct`);
            if (bar) bar.style.width = `${Math.round(pct * 100)}%`;
            if (label) label.textContent = `${Math.round(pct * 100)}%`;
        };

        if (mix) {
            toEl('bi-mod-key', mix.keydown || 0);
            toEl('bi-mod-mouse', mix.mousemove || 0);
            toEl('bi-mod-scroll', mix.scroll || 0);
            toEl('bi-mod-click', mix.click || 0);
            const modeEl = document.getElementById('bi-work-mode-badge');
            if (modeEl) modeEl.textContent = getWorkMode(mix);
        }

        // Scroll depth
        const depths = biScrollDepthHistory.filter(d => d > 0);
        const avgDepth = depths.length ? Math.round(depths.reduce((s, d) => s + d, 0) / depths.length) : 0;
        const depthEl = document.getElementById('bi-scroll-depth');
        const depthBar = document.getElementById('bi-scroll-depth-bar');
        if (depthEl) depthEl.textContent = avgDepth ? `${avgDepth}%` : '–%';
        if (depthBar) depthBar.style.width = `${avgDepth}%`;
    }

    function biRenderNotifFeed() {
        const feed = document.getElementById('bi-notif-feed');
        if (!feed) return;

        if (biNotifFeed.length === 0) {
            feed.innerHTML = '<p class="text-xs text-dynamic-variant text-center py-4">Notification decisions will appear here…</p>';
            return;
        }

        const ACTION_STYLES = {
            SHOW:     { dot: 'bg-emerald-500', label: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', text: 'SHOW' },
            DELAY:    { dot: 'bg-amber-400',   label: 'bg-amber-500/10 text-amber-400 border-amber-500/30',     text: 'DELAY' },
            SUPPRESS: { dot: 'bg-rose-500',    label: 'bg-rose-500/10 text-rose-400 border-rose-500/30',        text: 'SUPP' },
        };

        feed.innerHTML = biNotifFeed.map(item => {
            const action = item.decision?.action || 'DELAY';
            const priority = item.decision?.priority || 'MEDIUM';
            const reason = item.decision?.reason || '';
            const as = ACTION_STYLES[action] || ACTION_STYLES.DELAY;
            const time = new Date(item.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="flex items-start gap-2 p-2 rounded-xl bg-[var(--surface-high)]">
                    <span class="w-2 h-2 rounded-full ${as.dot} shrink-0 mt-1.5"></span>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-[10px] font-bold border rounded px-1.5 py-0.5 ${as.label}">${as.text}</span>
                            <span class="text-[10px] font-bold text-dynamic-variant uppercase">${priority}</span>
                        </div>
                        <p class="text-[10px] text-dynamic-variant mt-1 line-clamp-2">${reason}</p>
                    </div>
                    <span class="text-[9px] text-dynamic-variant shrink-0">${time}</span>
                </div>
            `;
        }).join('');
    }

    function biRenderConnectionStatus(connected) {
        const dot = document.getElementById('bi-status-dot');
        const text = document.getElementById('bi-status-text');
        if (!dot || !text) return;
        if (connected) {
            dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
            text.textContent = 'Extension Connected';
            text.className = 'text-xs font-bold uppercase tracking-widest text-emerald-400';
        } else {
            dot.className = 'w-2 h-2 rounded-full bg-[var(--on-surface-variant)] animate-pulse';
            text.textContent = 'Waiting for extension…';
            text.className = 'text-xs font-bold uppercase tracking-widest text-dynamic-variant';
        }
    }

    function biRenderAll() {
        if (!biViewActive) return;
        biRenderKpis();
        biRenderTimeline();
        biRenderDomainList();
        biRenderModality();
        biRenderNotifFeed();
        biRenderConnectionStatus(biConnected);
    }

    // ── IPC receiver ──
    ipcRenderer.on('browser-telemetry', (_, payload) => {
        if (!payload || typeof payload !== 'object') return;

        switch (payload.type) {
            case 'EXTENSION_CONNECTED':
                biConnected = true;
                break;
            case 'EXTENSION_DISCONNECTED':
                biConnected = false;
                break;
            case 'STATE_CHANGE':
            case 'STATE_SNAPSHOT':
                biConnected = true;
                biIngestStateChange(payload);
                break;
            case 'PIPELINE_UPDATE':
                biConnected = true;
                biIngestPipelineUpdate(payload);
                // Also grab state from pipeline
                if (payload.contextState?.state) biLatestContext = payload.contextState;
                break;
            case 'NOTIFICATION_DECISION':
                biIngestNotifDecision(payload);
                break;
        }

        biRenderAll();
    });

    // --- WhatsApp specific IPC Handlers ---
    ipcRenderer.on('whatsapp-qr', (_, qrString) => {
        const qrCanvas = document.getElementById('wa-profile-qr');
        const qrContainer = document.getElementById('wa-qr-container');
        const unlinkBtn = document.getElementById('unlink-wa-btn');
        const stopBtn = document.getElementById('stop-wa-btn');

        if (qrString === 'connected') {
            localStorage.setItem('wa-connected', 'true');
            // WhatsApp connected — hide QR, re-enable button
            if (qrContainer) qrContainer.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'none';
            if (unlinkBtn) {
                unlinkBtn.disabled = false;
                unlinkBtn.innerHTML = '&#10003; Connected — Reconnect WhatsApp';
            }
            return;
        }

        if (typeof qrString === 'string' && qrString.startsWith('error:')) {
            // Initialization failed
             if (qrContainer) {
                qrContainer.style.display = 'flex';
                const waitMsg = qrContainer.querySelector('p');
                if (waitMsg) waitMsg.textContent = 'Failed to load QR';
            }
            if (unlinkBtn) {
                unlinkBtn.disabled = false;
                unlinkBtn.innerHTML = `Error: ${qrString.replace('error:', '').substring(0, 30)}...`;
            }
            // keep stopBtn visible so they can hide it
            if (stopBtn) stopBtn.style.display = 'block';
            return;
        }

        // QR arrived — show container and draw the code
        if (qrContainer) {
            qrContainer.style.display = 'flex';
            const waitMsg = qrContainer.querySelector('p');
            if (waitMsg) waitMsg.textContent = 'Scan to Connect';
        }
        if (unlinkBtn) {
            unlinkBtn.disabled = false;
            unlinkBtn.innerHTML = `<span class="material-symbols-outlined text-[14px]">qr_code_scanner</span> Scan QR above`;
        }
        if (stopBtn) stopBtn.style.display = 'block';
        if (qrCanvas) {
            QRCode.toCanvas(qrCanvas, qrString, { margin: 1, scale: 4 }, function(error) {
                if (error) console.error('[WhatsApp QR]', error);
            });
        }
    });

    // --- Critical Escalation Alarm UI logic ---
    ipcRenderer.on('trigger-urgent-alarm', (_, data) => {
        // Build an ultra-aggressive full-screen overlay
        const overlay = document.createElement('div');
        overlay.id = 'urgent-alarm-overlay';
        overlay.className = 'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-red-600/95 text-white backdrop-blur-md animate-pulse';
        overlay.innerHTML = `
            <span class="material-symbols-outlined text-[100px] mb-4 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]">warning</span>
            <h1 class="text-6xl font-bold mb-4 tracking-widest text-center shadow-black drop-shadow-lg">URGENT NOTIFICATION</h1>
            <p class="text-3xl font-medium max-w-2xl text-center px-6 leading-tight flex-1 flex items-center">${data.task}</p>
            <p class="text-xl opacity-80 mt-4 mb-10">Arrived via ${data.source} from: <span class="font-bold">${data.sender}</span></p>
            
            <button id="dismiss-alarm-btn" class="px-10 py-5 bg-white text-red-600 font-black text-xl rounded-full hover:scale-110 hover:shadow-[0_0_30px_rgba(255,255,255,0.6)] transition-all shadow-xl">
                DISMISS ALARM & RETURN TO WORK
            </button>
        `;
        document.body.appendChild(overlay);

        // Web Audio API for a loud repetitive beep
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        let isAlarmPlaying = true;
        
        function playSiren() {
            if (!isAlarmPlaying) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'sawtooth';
            // Start high, drop fast like a siren
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.4);
            
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
            
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.4);
            
            setTimeout(playSiren, 500);
        }

        // Must resume context first to satisfy browser auto-play policies (though Electron usually ignores them)
        audioCtx.resume().then(() => playSiren());

        document.getElementById('dismiss-alarm-btn').addEventListener('click', () => {
            isAlarmPlaying = false;
            audioCtx.close();
            overlay.remove();
        });
    });

    // Default Initialization
    loadView('dashboard');
});
