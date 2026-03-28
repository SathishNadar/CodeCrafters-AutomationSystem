const fs = require('fs');
const path = require('path');

document.addEventListener('DOMContentLoaded', () => {
    // 1. Theme Toggling Setup
    const themeBtn = document.getElementById('theme-btn');
    const htmlEl = document.documentElement;

    themeBtn.addEventListener('click', () => {
        const isDark = htmlEl.classList.contains('dark');
        if (isDark) {
            htmlEl.classList.remove('dark'); // Switched to Light theme
            themeBtn.querySelector('span:first-child').textContent = 'Theme: Light';
            themeBtn.querySelector('.material-symbols-outlined').textContent = 'light_mode';
        } else {
            htmlEl.classList.add('dark'); // Switched to Dark theme
            themeBtn.querySelector('span:first-child').textContent = 'Theme: Dark';
            themeBtn.querySelector('.material-symbols-outlined').textContent = 'dark_mode';
        }
    });

    // 2. Sidebar Navigation Routing
    const navButtons = document.querySelectorAll('.nav-btn');
    const viewContainer = document.getElementById('view-container');
    const breadcrumb = document.getElementById('breadcrumb-current');

    function loadView(viewName) {
        const filePath = path.join(__dirname, 'views', `${viewName}.html`);
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error("Error loading view:", err);
                viewContainer.innerHTML = '<p class="text-dynamic text-center mt-10">Error loading view component</p>';
                return;
            }
            viewContainer.innerHTML = data;
            // After injection, attach the event listeners that apply to this specific view
            attachViewListeners(viewName);
        });
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Unset active states
            navButtons.forEach(b => {
                b.classList.remove('active', 'text-dynamic');
                b.classList.add('text-dynamic-variant', 'bg-transparent');
            });
            // Set active state on clicked
            btn.classList.add('active');
            btn.classList.remove('text-dynamic-variant', 'bg-transparent');

            // Find target and load
            const targetId = btn.getAttribute('data-target');
            loadView(targetId);

            // Update Breadcrumb Text
            breadcrumb.textContent = btn.querySelector('span:last-child').textContent;
        });
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
    }

    // 4. VS Code Cognitive Analytics Integration
    const { ipcRenderer } = require('electron');
    const analytics = require('./analytics');

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

    function addFeedCard(payload) {
        const feed = document.getElementById('vscode-activity-feed');
        if (!feed) return;

        const { event: evType, file, timestamp, duration_seconds, char_count, switch_count, error_count, to_state } = payload;
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
        addFeedCard(payload);
        updateCognitiveUI(snap);
    });

    // Default Initialization
    loadView('dashboard');
});
