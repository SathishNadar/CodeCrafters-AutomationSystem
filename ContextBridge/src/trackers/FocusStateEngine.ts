import * as vscode from 'vscode';
import { ActivityEvent, EventSender } from '../extension';

export type FocusState = 'deep_focus' | 'bug_hunt' | 'exploring' | 'idle' | 'shipping';

interface StateContext {
    lastTypingBurstDuration: number;
    lastSwitchVelocity: number;
    errorCount: number;
    isDebugging: boolean;
    lastCommitTime: number | null;
    lastSaveTime: number | null;
}

export class FocusStateEngine {
    private currentState: FocusState = 'idle';
    private ctx: StateContext = {
        lastTypingBurstDuration: 0,
        lastSwitchVelocity: 0,
        errorCount: 0,
        isDebugging: false,
        lastCommitTime: null,
        lastSaveTime: null,
    };

    constructor(
        private sender: EventSender,
        private outputChannel: vscode.OutputChannel
    ) {}

    /**
     * Called by extension.ts whenever any signal event is sent.
     * Updates internal context and may emit a state transition.
     */
    ingestEvent(event: ActivityEvent) {
        const prevState = this.currentState;

        switch (event.event) {
            case 'typing_burst':
                this.ctx.lastTypingBurstDuration = event.duration_seconds ?? 0;
                break;
            case 'editor_switch_velocity':
                this.ctx.lastSwitchVelocity = event.switch_count ?? 0;
                break;
            case 'diagnostics_snapshot':
                this.ctx.errorCount = event.error_count ?? 0;
                break;
            case 'debugging_started':
                this.ctx.isDebugging = true;
                break;
            case 'debugging_stopped':
                this.ctx.isDebugging = false;
                break;
            case 'git_commit_detected':
                this.ctx.lastCommitTime = Date.now();
                break;
            case 'file_saved':
                this.ctx.lastSaveTime = Date.now();
                break;
            case 'user_idle':
                this.transitionTo('idle', event);
                return;
            case 'user_returned':
                // Will be re-classified by next incoming event
                break;
        }

        const newState = this.classify();
        if (newState !== prevState) {
            this.transitionTo(newState, event);
        }
    }

    private classify(): FocusState {
        const { isDebugging, errorCount, lastSwitchVelocity, lastTypingBurstDuration, lastCommitTime, lastSaveTime } = this.ctx;

        // Bug Hunt: actively debugging OR many errors + rapid switching
        if (isDebugging || (errorCount > 5 && lastSwitchVelocity > 4)) {
            return 'bug_hunt';
        }

        // Shipping: recent commit (within 3 min) or recent save + error count is 0
        const recentAction = (t: number | null) => t !== null && (Date.now() - t) < 3 * 60 * 1000;
        if ((recentAction(lastCommitTime) || recentAction(lastSaveTime)) && errorCount === 0) {
            return 'shipping';
        }

        // Exploring: high switch velocity, short or no typing bursts
        if (lastSwitchVelocity >= 5 && lastTypingBurstDuration < 15) {
            return 'exploring';
        }

        // Deep Focus: long typing burst, low switches, low errors
        if (lastTypingBurstDuration >= 15 && lastSwitchVelocity <= 3 && errorCount <= 3) {
            return 'deep_focus';
        }

        // Default: keep current state, don't thrash
        return this.currentState;
    }

    private transitionTo(newState: FocusState, triggeringEvent: ActivityEvent) {
        const prevState = this.currentState;
        this.currentState = newState;

        this.outputChannel.appendLine(`[STATE] ${prevState} → ${newState}`);

        const event: ActivityEvent = {
            source: 'vscode',
            event: 'focus_state_changed',
            timestamp: new Date().toISOString(),
            from_state: prevState,
            to_state: newState,
            file: triggeringEvent.file,
            language: triggeringEvent.language,
            workspace: triggeringEvent.workspace
        };

        this.sender.queueEvent(event);
    }

    get state(): FocusState {
        return this.currentState;
    }
}
