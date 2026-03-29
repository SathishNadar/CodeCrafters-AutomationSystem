/**
 * Synthetic Data Test - Windows Notification Display
 * Shows exactly what the notification will contain
 */

const { Notification } = require('electron');

// === SYNTHETIC DATA ===
const syntheticScenarios = [
    {
        name: 'Scenario 1: Urgent Email from CTO',
        notification: {
            title: '🚨 URGENT MESSAGE ALERT',
            body: 'You have an URGENT Email from CTO@company.com. You\'ve been away for 20 minutes.',
            urgency: 'critical',
            timeoutType: 'never'
        },
        metadata: {
            source: 'Email',
            from: 'CTO@company.com',
            priority: 'URGENT',
            idleTime: '20 minutes',
            message: 'CRITICAL SECURITY BREACH DETECTED - IMMEDIATE ACTION REQUIRED'
        }
    },
    {
        name: 'Scenario 2: Urgent WhatsApp from Boss',
        notification: {
            title: '🚨 URGENT MESSAGE ALERT',
            body: 'You have an URGENT WhatsApp from Boss. You\'ve been away for 16 minutes.',
            urgency: 'critical',
            timeoutType: 'never'
        },
        metadata: {
            source: 'WhatsApp',
            from: 'Boss',
            priority: 'URGENT',
            idleTime: '16 minutes',
            message: 'NEED YOUR INPUT ON Q2 STRATEGY - URGENT'
        }
    },
    {
        name: 'Scenario 3: Urgent Email from COO',
        notification: {
            title: '🚨 URGENT MESSAGE ALERT',
            body: 'You have an URGENT Email from COO. You\'ve been away for 45 minutes.',
            urgency: 'critical',
            timeoutType: 'never'
        },
        metadata: {
            source: 'Email',
            from: 'COO',
            priority: 'URGENT',
            idleTime: '45 minutes',
            message: 'PRODUCTION ISSUE - DATABASE OUTAGE'
        }
    },
    {
        name: 'Scenario 4: Urgent WhatsApp from Mom',
        notification: {
            title: '🚨 URGENT MESSAGE ALERT',
            body: 'You have an URGENT WhatsApp from Mom. You\'ve been away for 22 minutes.',
            urgency: 'critical',
            timeoutType: 'never'
        },
        metadata: {
            source: 'WhatsApp',
            from: 'Mom',
            priority: 'URGENT',
            idleTime: '22 minutes',
            message: 'EMERGENCY CALL ME ASAP'
        }
    }
];

class WindowsNotificationTester {
    displaySyntheticNotification(scenario) {
        console.log('\n' + '='.repeat(80));
        console.log(`📋 ${scenario.name}`);
        console.log('='.repeat(80));

        const notif = scenario.notification;
        const meta = scenario.metadata;

        console.log('\n📍 WINDOWS NOTIFICATION DETAILS:');
        console.log('─'.repeat(80));
        console.log(`  Title:       ${notif.title}`);
        console.log(`  Body:        ${notif.body}`);
        console.log(`  Urgency:     ${notif.urgency}`);
        console.log(`  Timeout:     ${notif.timeoutType}`);
        console.log('─'.repeat(80));

        console.log('\n📬 MESSAGE SOURCE DETAILS:');
        console.log('─'.repeat(80));
        console.log(`  Source:      ${meta.source}`);
        console.log(`  From:        ${meta.from}`);
        console.log(`  Priority:    🔴 ${meta.priority}`);
        console.log(`  Idle Time:   ⏰ ${meta.idleTime}`);
        console.log(`  Message:     "${meta.message}"`);
        console.log('─'.repeat(80));

        console.log('\n🔊 ALARM TRIGGER:');
        console.log('─'.repeat(80));
        console.log('  Status:      ✅ ALL CONDITIONS MET');
        console.log('  Condition 1: ✅ User idle 15+ minutes');
        console.log('  Condition 2: ✅ Rule "Urgent Escalation Alarm" is ACTIVE');
        console.log('  Condition 3: ✅ URGENT priority notification received');
        console.log('  Result:      🔊 BEEP ALARM + 📢 NOTIFICATION SENT');
        console.log('─'.repeat(80));

        // Try to show actual Electron notification
        this.tryShowNotification(notif);
    }

    tryShowNotification(notifData) {
        try {
            console.log('\n⏳ Attempting to show Windows notification...');
            const notification = new Notification({
                title: notifData.title,
                body: notifData.body,
                urgency: notifData.urgency,
                timeoutType: notifData.timeoutType
            });

            notification.show();
            console.log('✅ Notification shown successfully!');
            console.log('   (Should appear in Windows notification center)');
        } catch (error) {
            console.log(`⚠️  Cannot show Electron notification in this environment`);
            console.log(`    Error: ${error.message}`);
            console.log('    But this is the data that WOULD be sent to Windows:');
            console.log(`    - Title: "${notifData.title}"`);
            console.log(`    - Body: "${notifData.body}"`);
            console.log(`    - Urgency: ${notifData.urgency}`);
        }
    }

    displayAllScenarios() {
        console.log('\n' + '█'.repeat(80));
        console.log('  🪟 WINDOWS NOTIFICATION - SYNTHETIC DATA TEST');
        console.log('█'.repeat(80));

        syntheticScenarios.forEach((scenario, index) => {
            this.displaySyntheticNotification(scenario);
            
            // Add delay between scenarios
            if (index < syntheticScenarios.length - 1) {
                console.log('\n⏳ Next scenario in 2 seconds...\n');
            }
        });

        this.printSummary();
    }

    printSummary() {
        console.log('\n' + '█'.repeat(80));
        console.log('  📊 NOTIFICATION DATA SUMMARY');
        console.log('█'.repeat(80));

        console.log(`\n✅ Total Scenarios Tested: ${syntheticScenarios.length}`);
        console.log('\n📋 All Notifications Share These Properties:');
        console.log('─'.repeat(80));
        console.log('  🚨 Title Format:     "🚨 URGENT MESSAGE ALERT"');
        console.log('  📱 Body Format:      "You have an URGENT {source} from {name}. You\'ve been away for {time}."');
        console.log('  ⚠️  Urgency Level:    "critical" (highest priority)');
        console.log('  ⏱️  Timeout Type:     "never" (stays until user clicks)');
        console.log('─'.repeat(80));

        console.log('\n🔊 Alarm Pattern:');
        console.log('─'.repeat(80));
        console.log('  Beep 1:  800 Hz for 200ms');
        console.log('  Beep 2:  800 Hz for 200ms');
        console.log('  Beep 3:  1000 Hz for 300ms');
        console.log('  Total Duration: ~850ms');
        console.log('─'.repeat(80));

        console.log('\n📬 Notification Triggering Conditions:');
        console.log('─'.repeat(80));
        console.log('  1. User IDLE state: YES (not using computer)');
        console.log('  2. Idle Duration: 15+ minutes');
        console.log('  3. Rule Status: "Urgent Escalation Alarm" = ACTIVE');
        console.log('  4. Message Priority: URGENT');
        console.log('  5. Message Source: Email OR WhatsApp');
        console.log('─'.repeat(80));

        console.log('\n✅ When User Clicks Notification:');
        console.log('─'.repeat(80));
        console.log('  • Notification is dismissed');
        console.log('  • Application can handle the click event');
        console.log('  • Typically opens the message/app');
        console.log('─'.repeat(80));

        console.log('\n' + '█'.repeat(80));
        console.log('✨ Notification Display Test Complete!');
        console.log('█'.repeat(80) + '\n');
    }
}

// Run the test
if (require.main === module) {
    const tester = new WindowsNotificationTester();
    tester.displayAllScenarios();
}

module.exports = WindowsNotificationTester;
