const { EventEmitter } = require('node:events');

function normalizePriority(priority) {
    const value = String(priority || '').trim().toUpperCase();
    if (!value) return 'MEDIUM';
    if (value === 'URGENT') return 'CRITICAL';
    if (value === 'HIGH') return 'HIGH';
    if (value === 'CRITICAL') return 'CRITICAL';
    if (value === 'LOW') return 'LOW';
    return 'MEDIUM';
}

class AttentionPolicyManager extends EventEmitter {
    constructor() {
        super();
        this.policy = null;
        this.expiryTimer = null;
    }

    activate(command) {
        if (!command || command.kind !== 'activate') {
            throw new Error('A parsed activation command is required.');
        }

        this.clearTimer();

        this.policy = {
            active: true,
            source: 'voice',
            mode: command.mode,
            label: command.label,
            transcript: command.transcript,
            startedAt: command.startedAt,
            endsAt: command.endsAt,
            summary: command.summary,
        };

        const remainingMs = Math.max(0, this.policy.endsAt - Date.now());
        this.expiryTimer = setTimeout(() => {
            this.clear('expired');
        }, remainingMs);

        return this.emitChange('activated');
    }

    clear(reason = 'manual') {
        this.clearTimer();
        this.policy = null;
        return this.emitChange(reason);
    }

    getState() {
        if (!this.policy) {
            return this.buildInactiveState();
        }

        const remainingMs = Math.max(0, this.policy.endsAt - Date.now());
        if (remainingMs === 0) {
            return this.buildInactiveState();
        }

        return {
            ...this.policy,
            remainingMs,
        };
    }

    shouldAllowInterrupt(priority) {
        const state = this.getState();
        if (!state.active) return true;

        const normalizedPriority = normalizePriority(priority);
        if (state.mode === 'mute_all') return false;

        return normalizedPriority === 'CRITICAL' || normalizedPriority === 'HIGH';
    }

    subscribe(listener) {
        this.on('changed', listener);
        listener(this.getState());
        return () => this.off('changed', listener);
    }

    emitChange(reason) {
        const state = this.getState();
        this.emit('changed', {
            ...state,
            reason,
        });
        return state;
    }

    buildInactiveState() {
        return {
            active: false,
            source: 'system',
            mode: 'normal',
            label: 'Adaptive Mode',
            transcript: null,
            startedAt: null,
            endsAt: null,
            remainingMs: 0,
            summary: 'Notifications are following the live context engine.',
        };
    }

    clearTimer() {
        if (this.expiryTimer) {
            clearTimeout(this.expiryTimer);
            this.expiryTimer = null;
        }
    }
}

module.exports = {
    AttentionPolicyManager,
    normalizePriority,
};
