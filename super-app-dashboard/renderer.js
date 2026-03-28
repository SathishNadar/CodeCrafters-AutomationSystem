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
                        // Wait a sec for the UI events to come back
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
                // Must clone/replace to prevent duplicate listeners if re-entering the view
                const newSendBtn = sendBtn.cloneNode(true);
                sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
                
                newSendBtn.addEventListener('click', async () => {
                    if (!currentReplyContext) return;
                    
                    const to = document.getElementById('reply-to-address').textContent.trim();
                    const subject = document.getElementById('reply-subject').value;
                    const userReplyText = document.getElementById('reply-content').value;
                    
                    if (!userReplyText.trim()) return;
                    
                    newSendBtn.innerText = "Sending...";
                    newSendBtn.classList.add('opacity-50', 'pointer-events-none');
                    
                    const originalEmailText = currentReplyContext.email.fullContent || currentReplyContext.email.snippet;
                    // Append original email context
                    const fullContent = `${userReplyText}\n\nOn ${new Date().toLocaleString()}, ${to} wrote:\n> ${originalEmailText.replace(/\n/g, '\n> ')}`;
                    
                    try {
                        const res = await ipcRenderer.invoke('send-email-reply', {
                            to,
                            subject: subject.trim(),
                            content: fullContent,
                            threadId: currentReplyContext.email.threadId,
                            messageId: currentReplyContext.email.messageId
                        });
                        
                        if (res.success) {
                            closeReplyModal();
                            // Optional: Show a little toast
                        } else {
                            alert("Failed to send: " + res.error);
                        }
                    } catch (e) {
                        console.error(e);
                        alert("Error sending reply.");
                    } finally {
                        newSendBtn.innerHTML = `<span class="material-symbols-outlined text-[14px]">send</span> Send Reference Task`;
                        newSendBtn.classList.remove('opacity-50', 'pointer-events-none');
                    }
                });
            }
        }
    };

    // Default Initialization
    loadView('dashboard');
});

