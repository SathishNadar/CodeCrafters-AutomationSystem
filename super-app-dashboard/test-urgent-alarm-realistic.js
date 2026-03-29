const { exec } = require('child_process');
const { Notification } = require('electron');
const RulesEngineTester = require('./test-rules.js');

/**
 * Advanced Urgent Alarm Test
 * Conditions:
 * 1. User idle for 15+ minutes
 * 2. Urgent escalation alarm rule is ACTIVE
 * 3. Priority notification arrives (Email or WhatsApp)
 * => Trigger: Sound beep + Windows notification
 */

class UrgentAlarmSimulator {
    constructor() {
        this.tester = new RulesEngineTester();
        this.idleTimeMs = 0;
        this.alarmFired = false;
    }

    playBeep(frequency = 800, duration = 300) {
        return new Promise((resolve) => {
            exec(`powershell -c [console]::beep(${frequency}, ${duration})`, (err) => {
                resolve();
            });
        });
    }

    async playAlarmSequence() {
        console.log('🔊 Playing alarm sequence...\n');
        
        // Play 3 beeps in sequence
        const beepPattern = [
            { freq: 800, dur: 200 },
            { freq: 800, dur: 200 },
            { freq: 1000, dur: 300 }
        ];

        for (const beep of beepPattern) {
            await this.playBeep(beep.freq, beep.dur);
            await new Promise(r => setTimeout(r, 100));
        }
    }

    sendWindowsNotification(title, body) {
        try {
            new Notification({
                title: title,
                body: body,
                urgency: 'critical',
                timeoutType: 'never'
            }).show();
            console.log(`✅ Windows Notification sent: "${title}"`);
        } catch (e) {
            console.log(`📢 [Cannot send Notification in test environment]`);
            console.log(`   Title: ${title}`);
            console.log(`   Body: ${body}`);
        }
    }

    checkConditions() {
        console.log('\n' + '='.repeat(70));
        console.log('📋 CHECKING ALL CONDITIONS FOR URGENT ALARM');
        console.log('='.repeat(70));

        const conditions = {
            idle15min: this.idleTimeMs >= 15 * 60 * 1000,
            ruleActive: this.tester.isRuleActive('rule_urgent_alarm'),
            priorityNotification: true // Simulated
        };

        console.log(`\n1️⃣  Idle Time Requirement:`);
        console.log(`    ${conditions.idle15min ? '✅' : '❌'} User idle for ${Math.round(this.idleTimeMs / 1000 / 60)} minutes (need: 15+)`);

        console.log(`\n2️⃣  Rule Status:`);
        console.log(`    ${conditions.ruleActive ? '✅' : '❌'} Urgent Escalation Alarm is ${conditions.ruleActive ? 'ACTIVE' : 'INACTIVE'}`);

        console.log(`\n3️⃣  Priority Notification:`);
        console.log(`    ✅ Email/WhatsApp with URGENT priority received`);

        const allMet = conditions.idle15min && conditions.ruleActive && conditions.priorityNotification;

        console.log('\n' + '='.repeat(70));
        if (allMet) {
            console.log('✅ ALL CONDITIONS MET - TRIGGERING URGENT ALARM');
        } else {
            console.log('❌ CONDITIONS NOT MET - NO ALARM');
        }
        console.log('='.repeat(70));

        return allMet;
    }

    async runTest() {
        console.log('\n' + '█'.repeat(70));
        console.log('  🚨 URGENT ESCALATION ALARM - REALISTIC SCENARIO TEST');
        console.log('█'.repeat(70));

        // Simulate 15+ minutes of idle time
        this.idleTimeMs = 16 * 60 * 1000; // 16 minutes
        console.log(`\n⏰ User has been IDLE for ${Math.round(this.idleTimeMs / 1000 / 60)} minutes`);

        // Set user context to IDLE
        this.tester.updateContext({
            isFocused: false,
            isIdle: true,
            isDistracted: false
        });

        // Check if all conditions are met
        if (!this.checkConditions()) {
            console.log('\n⚠️  Conditions not met. Alarm not triggered.');
            return;
        }

        // Conditions are met - trigger alarm
        console.log('\n' + '='.repeat(70));
        console.log('🚨 TRIGGERING URGENT ALARM SEQUENCE');
        console.log('='.repeat(70));

        // Play alarm sound
        await this.playAlarmSequence();

        // Send Windows Notification with alarm info
        this.sendWindowsNotification(
            '🚨 URGENT MESSAGE ALERT',
            'You have received an URGENT priority message while away. Click to view.'
        );

        console.log('\n📬 INCOMING PRIORITY MESSAGES:');
        console.log('─'.repeat(70));

        const messages = [
            {
                source: 'WhatsApp',
                from: 'Boss',
                priority: 'URGENT',
                message: 'Critical issue needs immediate attention!'
            },
            {
                source: 'Email',
                from: 'CTO@company.com',
                priority: 'URGENT',
                message: 'Security breach detected - needs your action'
            }
        ];

        messages.forEach((msg, idx) => {
            console.log(`\n${idx + 1}. ${msg.source} from ${msg.from}`);
            console.log(`   Priority: 🔴 ${msg.priority}`);
            console.log(`   Message: "${msg.message}"`);
            console.log(`   Status: 🔊 ALARM TRIGGERED + 📢 NOTIFICATION SENT`);
        });

        console.log('\n' + '─'.repeat(70));
        console.log('✅ Alarm sequence completed!\n');
    }
}

// Run the test
if (require.main === module) {
    const simulator = new UrgentAlarmSimulator();
    simulator.runTest().then(() => {
        console.log('█'.repeat(70));
        console.log('✨ Test completed! You should have heard alarm beeps.');
        console.log('█'.repeat(70) + '\n');
        process.exit(0);
    });
}

module.exports = UrgentAlarmSimulator;
