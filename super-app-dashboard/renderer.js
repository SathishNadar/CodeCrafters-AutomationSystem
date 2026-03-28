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
    }

    // Default Initialization
    loadView('dashboard');
});
