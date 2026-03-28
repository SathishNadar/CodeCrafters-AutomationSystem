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

    // 4. VS Code Context Stream Integration
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('vscode-event', (event, payload) => {
        const feed = document.getElementById('vscode-activity-feed');
        const lastMsg = document.getElementById('vscode-last-event');
        
        if (feed && lastMsg) {
            // Update the dashboard UI live
            const { event: evType, file, timestamp } = payload;
            const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            // Icon mapping
            const iconMap = {
                'typing_activity': 'edit_note',
                'file_saved': 'save',
                'active_editor_changed': 'open_in_new',
                'workspace_opened': 'folder_open',
                'debugging_started': 'bug_report',
                'terminal_opened': 'terminal',
                'git_commit_detected': 'commit'
            };
            
            const icon = iconMap[evType] || 'api';
            const title = evType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            
            // Create a new signal card
            const newCard = document.createElement('div');
            newCard.className = "glass-panel rounded-lg p-4 flex flex-col gap-2 animate-fade-in-up border-l-4 border-secondary-dynamic";
            newCard.innerHTML = `
                <div class="flex justify-between items-center">
                    <h4 class="font-bold text-dynamic flex items-center gap-2"><span class="material-symbols-outlined text-secondary-dynamic text-lg">${icon}</span> ${title}</h4>
                    <span class="text-[10px] text-dynamic-variant uppercase font-bold tracking-widest">${timeStr}</span>
                </div>
                <p class="text-xs text-dynamic-variant truncate">${file ? "File: " + file.split('/').pop() : 'Direct Activity Pulse'}</p>
            `;
            
            // Add to feed, max 3 items
            feed.prepend(newCard);
            if (feed.children.length > 4) {
                feed.removeChild(feed.lastChild);
            }
        }
    });

    // Default Initialization
    loadView('dashboard');
});
