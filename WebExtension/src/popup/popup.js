/**
 * popup.js — Signal Forge Extension Popup
 *
 * Reads from chrome.storage.local (written every cycle by StorageLayer)
 * and renders a clean, human-readable focus intelligence panel.
 *
 * No background messaging needed — storage is the source of truth.
 */

// ── Data definitions ──────────────────────────────────────────────────────────

const STATE_CONFIG = {
  active_focus: {
    label: 'Active Focus',
    icon: 'bolt',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.15)',
    barGradient: 'linear-gradient(90deg, #10b981, #34d399)',
    scoreColor: '#10b981',
    heroClass: 's-active_focus',
  },
  passive_focus: {
    label: 'Passive Focus',
    icon: 'visibility',
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.15)',
    barGradient: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
    scoreColor: '#60a5fa',
    heroClass: 's-passive_focus',
  },
  distracted: {
    label: 'Distracted',
    icon: 'warning',
    color: '#f43f5e',
    bg: 'rgba(244,63,94,0.15)',
    barGradient: 'linear-gradient(90deg, #f43f5e, #fb7185)',
    scoreColor: '#f43f5e',
    heroClass: 's-distracted',
  },
  idle: {
    label: 'Idle',
    icon: 'hourglass_top',
    color: '#94a3b8',
    bg: 'rgba(148,163,184,0.12)',
    barGradient: 'linear-gradient(90deg, #64748b, #94a3b8)',
    scoreColor: '#94a3b8',
    heroClass: 's-idle',
  },
  transitioning: {
    label: 'Transitioning',
    icon: 'refresh',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.15)',
    barGradient: 'linear-gradient(90deg, #d97706, #f59e0b)',
    scoreColor: '#f59e0b',
    heroClass: 's-transitioning',
  },
};

const CATEGORY_LABELS = {
  productivity: { label: 'Productivity site', color: '#818cf8' },
  communication: { label: 'Communication', color: '#38bdf8' },
  media: { label: 'Media / Video', color: '#f43f5e' },
  social: { label: 'Social media', color: '#f59e0b' },
  neutral: { label: 'Neutral site', color: '#64748b' },
  unknown: { label: 'Unknown site', color: '#475569' },
};

// ── Helper functions ──────────────────────────────────────────────────────────

function getFocusScoreLabel(score) {
  if (score >= 0.75) return 'Excellent';
  if (score >= 0.5)  return 'Good';
  if (score >= 0.25) return 'Moderate';
  if (score > 0)     return 'Low';
  return '—';
}

function getSwitchingLabel(rate1m) {
  if (rate1m === undefined || rate1m === null) return { label: 'No data', sub: '' };
  if (rate1m === 0)  return { label: 'Single-tasking', sub: 'Fully in one context' };
  if (rate1m <= 2)   return { label: 'Focused',        sub: 'Minimal switching' };
  if (rate1m <= 5)   return { label: 'Moderate',       sub: `${rate1m} switches/min` };
  if (rate1m <= 9)   return { label: 'High switching',  sub: `${rate1m} switches/min` };
  return { label: 'Very scattered', sub: `${rate1m} switches/min` };
}

function getWorkMode(mix) {
  if (!mix) return null;
  const entries = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  const dominant = entries[0]?.[0];
  const pct = Math.round((entries[0]?.[1] || 0) * 100);

  const modes = {
    keydown:   { icon: 'keyboard',        label: 'Writing / Coding',   desc: `Keyboard dominant (${pct}% of input)` },
    scroll:    { icon: 'swipe_vertical',  label: 'Reading / Research', desc: `Scroll dominant (${pct}% of input)` },
    mousemove: { icon: 'mouse',           label: 'Browsing',           desc: `Mouse navigation (${pct}% of input)` },
    click:     { icon: 'ads_click',       label: 'Navigating',         desc: `Click dominant (${pct}% of input)` },
  };

  return modes[dominant] || null;
}

function formatMs(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Render functions ──────────────────────────────────────────────────────────

function renderEmpty() {
  return `
    <div class="empty-state">
      <span class="material-symbols-outlined">signal_disconnected</span>
      <div class="empty-title">No focus data yet</div>
      <div class="empty-desc">
        Browse any page in Chrome to start<br>tracking your focus and context state.
      </div>
    </div>
  `;
}

function renderContent(pipeline, decision) {
  const vector = pipeline?.vector || {};
  const contextState = pipeline?.contextState || {};

  const state = contextState.state || 'transitioning';
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.transitioning;

  const domain = contextState.currentDomain || vector.currentDomain || '—';
  const category = contextState.domainCategory || vector.currentDomainCategory || 'neutral';
  const catCfg = CATEGORY_LABELS[category] || CATEGORY_LABELS.unknown;

  const focusScore = contextState.focusScore || vector.focusScore || 0;
  const focusPct = Math.round(focusScore * 100);

  const switchRate1m = vector.tabSwitchRate1m ?? null;
  const switching = getSwitchingLabel(switchRate1m);

  const dwellMs = vector.timeOnCurrentDomainMs || 0;
  const workMode = getWorkMode(vector.inputModalityMix);

  const queueDepth = pipeline?.queueDepth ?? 0;
  const lastDecision = decision?.decision;

  // Notifications on hold
  let notifBlock = '';
  if (queueDepth > 0) {
    notifBlock = `
      <div class="notif-hold">
        <span class="material-symbols-outlined" style="color:#f59e0b">notifications_paused</span>
        <div style="flex:1">
          <div class="work-mode-label">${queueDepth} notification${queueDepth !== 1 ? 's' : ''} held back</div>
          <div class="work-mode-desc">Delayed while you're in ${cfg.label} mode</div>
        </div>
        <div class="notif-count-badge" style="background:rgba(245,158,11,0.15);color:#f59e0b">${queueDepth}</div>
      </div>
    `;
  } else if (lastDecision?.action === 'SHOW') {
    notifBlock = `
      <div class="notif-hold">
        <span class="material-symbols-outlined" style="color:#10b981">notifications_active</span>
        <div style="flex:1">
          <div class="work-mode-label">Notifications flowing normally</div>
          <div class="work-mode-desc">No interruptions being held back</div>
        </div>
      </div>
    `;
  }

  // Work mode block
  let workModeBlock = '';
  if (workMode) {
    workModeBlock = `
      <div class="work-mode-row">
        <span class="material-symbols-outlined">${workMode.icon}</span>
        <div class="work-mode-text">
          <div class="work-mode-label">${workMode.label}</div>
          <div class="work-mode-desc">${workMode.desc}</div>
        </div>
      </div>
    `;
  }

  return `
    <!-- State Hero -->
    <div class="state-hero ${cfg.heroClass}">
      <div class="state-row">
        <div class="state-icon-wrap" style="background:${cfg.bg}">
          <span class="material-symbols-outlined" style="color:${cfg.color}">${cfg.icon}</span>
        </div>
        <div class="state-main">
          <div class="state-kicker">Focus State</div>
          <div class="state-label" style="color:${cfg.color}">${cfg.label}</div>
          <div class="state-domain" title="${escHtml(domain)}">${escHtml(domain)} &nbsp;·&nbsp; <span style="color:${catCfg.color}">${catCfg.label}</span></div>
        </div>
        <div class="focus-score-wrap">
          <div class="focus-score-num" style="color:${cfg.scoreColor}">${focusPct > 0 ? focusPct + '%' : '—'}</div>
          <div class="focus-score-label">${getFocusScoreLabel(focusScore)}</div>
        </div>
      </div>
      <div class="focus-bar-track">
        <div class="focus-bar-fill" id="focus-bar-fill" style="width:${focusPct}%;background:${cfg.barGradient}"></div>
      </div>
    </div>

    <!-- Metrics grid -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-kicker">Context Switching</div>
        <div class="metric-value">${switching.label}</div>
        <div class="metric-sub">${switching.sub || 'Tab switch pattern'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-kicker">Time on Page</div>
        <div class="metric-value">${formatMs(dwellMs)}</div>
        <div class="metric-sub">Current session</div>
      </div>
    </div>

    <!-- Work mode -->
    ${workModeBlock}

    <!-- Notification hold -->
    ${notifBlock}

    <!-- Footer -->
    <div class="footer">
      <div class="footer-link">
        <span class="material-symbols-outlined">timeline</span>
        Signal Forge
      </div>
      <span class="dashboard-badge">Connected to Dashboard</span>
    </div>
  `;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const contentEl = document.getElementById('content');
  const connDot = document.getElementById('conn-dot');
  const connLabel = document.getElementById('conn-label');

  try {
    const data = await chrome.storage.local.get(['latestPipeline', 'latestDecision']);
    const pipeline = data.latestPipeline;
    const decision = data.latestDecision;

    if (!pipeline) {
      connLabel.textContent = 'No data';
      contentEl.innerHTML = renderEmpty();
      return;
    }

    // Data exists — mark as live
    connDot.classList.add('live');
    connLabel.textContent = 'Live';

    // Check freshness (data older than 2min = stale)
    const age = Date.now() - (pipeline.savedAt || 0);
    if (age > 120_000) {
      connDot.classList.remove('live');
      connLabel.textContent = 'Stale';
    }

    contentEl.innerHTML = renderContent(pipeline, decision);

  } catch (err) {
    connLabel.textContent = 'Error';
    contentEl.innerHTML = `<div class="empty-state">
      <span class="material-symbols-outlined">error</span>
      <div class="empty-title">Could not load data</div>
      <div class="empty-desc">${escHtml(err.message)}</div>
    </div>`;
  }
}

document.addEventListener('DOMContentLoaded', main);
