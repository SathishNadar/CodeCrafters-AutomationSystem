const MODE_CONFIG = {
    mute_all: {
        label: 'Mute All Notifications',
        defaultDurationMs: 60 * 60 * 1000,
    },
    priority_only: {
        label: 'Priority Notifications Only',
        defaultDurationMs: 60 * 60 * 1000,
    },
    deep_work: {
        label: 'Deep Work',
        defaultDurationMs: 90 * 60 * 1000,
    },
};

function normalizeTranscript(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function detectMode(text) {
    if (
        /\b(resume|normal mode|turn off deep work|disable deep work|clear (?:the )?(?:mode|override)|back to normal)\b/i.test(text)
    ) {
        return 'clear';
    }

    if (
        /\b(no notifications(?: at all)?|mute all|silence all|block all notifications|do not disturb|don't disturb me|dont disturb me)\b/i.test(text)
    ) {
        return 'mute_all';
    }

    if (
        /\b(priority only|only important|important only|urgent only|critical only|high priority only|priority notifications only)\b/i.test(text)
    ) {
        return 'priority_only';
    }

    if (/\b(deep work|focus mode|focus session|focus block)\b/i.test(text)) {
        return 'deep_work';
    }

    return null;
}

function parseDurationMs(text) {
    const match = text.match(
        /\bfor\s+(?:(an?|one)\s+)?(\d+(?:\.\d+)?)?\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/i
    );

    if (!match) return null;

    const rawNumber = match[2];
    const unit = match[3].toLowerCase();
    const amount = rawNumber ? Number(rawNumber) : 1;

    if (!Number.isFinite(amount) || amount <= 0) return null;

    if (unit.startsWith('hour') || unit.startsWith('hr')) {
        return Math.round(amount * 60 * 60 * 1000);
    }

    return Math.round(amount * 60 * 1000);
}

function resolveHourCandidate(baseDate, hour24, minutes) {
    const candidate = new Date(baseDate.getTime());
    candidate.setSeconds(0, 0);
    candidate.setHours(hour24, minutes, 0, 0);
    return candidate;
}

function parseUntilTime(text, now = new Date()) {
    const special = text.match(/\b(?:until|till|til)\s+(midnight|noon)\b/i);
    if (special) {
        const target = new Date(now.getTime());
        target.setSeconds(0, 0);
        if (special[1].toLowerCase() === 'midnight') {
            target.setDate(target.getDate() + 1);
            target.setHours(0, 0, 0, 0);
        } else {
            target.setHours(12, 0, 0, 0);
            if (target <= now) target.setDate(target.getDate() + 1);
        }
        return target;
    }

    const match = text.match(/\b(?:until|till|til)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (!match) return null;

    const hour = Number(match[1]);
    const minutes = Number(match[2] || '0');
    const meridiem = match[3] ? match[3].toLowerCase() : null;

    if (!Number.isInteger(hour) || !Number.isInteger(minutes) || minutes > 59) {
        return null;
    }

    if (meridiem) {
        let hour24 = hour % 12;
        if (meridiem === 'pm') hour24 += 12;
        const target = resolveHourCandidate(now, hour24, minutes);
        if (target <= now) target.setDate(target.getDate() + 1);
        return target;
    }

    const candidates = [];

    if (hour >= 0 && hour <= 23) {
        candidates.push(resolveHourCandidate(now, hour, minutes));
    }

    if (hour >= 1 && hour <= 12) {
        candidates.push(resolveHourCandidate(now, hour % 12, minutes));
        candidates.push(resolveHourCandidate(now, (hour % 12) + 12, minutes));
    }

    const futureCandidates = candidates
        .filter((candidate) => candidate > now)
        .sort((a, b) => a.getTime() - b.getTime());

    if (futureCandidates.length > 0) {
        return futureCandidates[0];
    }

    if (candidates.length === 0) return null;

    const fallback = new Date(candidates[0].getTime());
    fallback.setDate(fallback.getDate() + 1);
    return fallback;
}

function formatDuration(durationMs) {
    const totalMinutes = Math.round(durationMs / 60000);
    if (totalMinutes < 60) {
        return `${totalMinutes} min`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) {
        return `${hours} hr${hours === 1 ? '' : 's'}`;
    }

    return `${hours} hr ${minutes} min`;
}

function formatEndsAt(dateLike) {
    const date = new Date(dateLike);
    if (Number.isNaN(date.getTime())) return 'later';

    return date.toLocaleString([], {
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        day: 'numeric',
    });
}

function buildActivationSummary(mode, endsAt, durationMs) {
    const label = MODE_CONFIG[mode]?.label || 'Focus Mode';
    if (endsAt) {
        return `${label} enabled until ${formatEndsAt(endsAt)}.`;
    }
    return `${label} enabled for ${formatDuration(durationMs)}.`;
}

function parseVoiceCommand(transcript, nowInput = new Date()) {
    const normalizedTranscript = normalizeTranscript(transcript);
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput);

    if (!normalizedTranscript) {
        return {
            ok: false,
            error: 'Say a command like "deep work for 2 hours" or "mute all notifications until 5 PM".',
        };
    }

    const lowered = normalizedTranscript.toLowerCase();
    const mode = detectMode(lowered);

    if (!mode) {
        return {
            ok: false,
            error: 'I could not map that to a work mode yet. Try "mute all", "priority only", or "deep work".',
        };
    }

    if (mode === 'clear') {
        return {
            ok: true,
            kind: 'clear',
            transcript: normalizedTranscript,
            summary: 'Returned to the normal adaptive notification flow.',
        };
    }

    const until = parseUntilTime(lowered, now);
    const durationMs = parseDurationMs(lowered) || MODE_CONFIG[mode].defaultDurationMs;
    const endsAt = until ? until.getTime() : now.getTime() + durationMs;

    return {
        ok: true,
        kind: 'activate',
        mode,
        label: MODE_CONFIG[mode].label,
        transcript: normalizedTranscript,
        startedAt: now.getTime(),
        endsAt,
        durationMs: Math.max(0, endsAt - now.getTime()),
        summary: buildActivationSummary(mode, endsAt, durationMs),
    };
}

module.exports = {
    MODE_CONFIG,
    formatDuration,
    formatEndsAt,
    parseVoiceCommand,
};
