/**
 * Manual Urgent Alarm Trigger
 * Run this to trigger the alarm manually with custom data
 */

const { exec } = require('child_process');

class ManualAlarmTrigger {
    constructor() {
        this.isIdle = false;
        this.idleStartTime = null;
    }

    // Play beep sound
    async playBeep(frequency = 800, duration = 300) {
        return new Promise((resolve) => {
            exec(`powershell -c [console]::beep(${frequency}, ${duration})`, (err) => {
                if (err) console.log('Note: Beep not available');
                resolve();
            });
        });
    }

    // Play alarm sequence
    async playAlarm() {
        console.log('\n🔊 Playing alarm beeps...');
        const alarmPattern = [
            { freq: 800, dur: 200 },
            { freq: 800, dur: 200 },
            { freq: 1000, dur: 300 }
        ];

        for (const beep of alarmPattern) {
            await this.playBeep(beep.freq, beep.dur);
            await new Promise(r => setTimeout(r, 150));
        }
        console.log('✅ Alarm complete!\n');
    }

    // Simulate idle state
    setIdle(minutes) {
        this.isIdle = true;
        this.idleStartTime = Date.now() - (minutes * 60 * 1000);
        console.log(`⏰ Set idle state: ${minutes} minutes`);
    }

    // Trigger manual alarm
    async triggerManualAlarm(source, from, minutes) {
        console.log('\n' + '═'.repeat(80));
        console.log('🚨 MANUAL URGENT ALARM TRIGGER');
        console.log('═'.repeat(80));

        // Check conditions
        console.log('\n📋 Checking conditions:');
        console.log(`  1️⃣  User idle: ${this.isIdle ? '✅ YES' : '❌ NO'}`);
        console.log(`  2️⃣  Idle for 15+ minutes: ${minutes >= 15 ? '✅ YES (' + minutes + ' min)' : '❌ NO (' + minutes + ' min)'}`);
        console.log(`  3️⃣  Rule active: ✅ YES (for manual test)`);
        console.log(`  4️⃣  Priority: ✅ URGENT`);
        console.log(`  5️⃣  Source: ${source} from ${from}`);

        const conditionsMet = this.isIdle && minutes >= 15;

        if (!conditionsMet) {
            console.log('\n❌ Conditions NOT met. Alarm will NOT trigger.');
            return;
        }

        console.log('\n✅ ALL CONDITIONS MET!\n');

        // Play alarm
        await this.playAlarm();

        // Show notification info
        console.log('📢 NOTIFICATION DETAILS:');
        console.log('─'.repeat(80));
        console.log(`  Title:    🚨 URGENT MESSAGE ALERT`);
        console.log(`  Body:     You have an URGENT ${source} from ${from}.`);
        console.log(`  Body:     You've been away for ${minutes} minutes.`);
        console.log(`  Urgency:  CRITICAL`);
        console.log(`  Timeout:  NEVER (stays until clicked)`);
        console.log('─'.repeat(80));

        console.log('\n✅ Alarm triggered successfully!');
        console.log('═'.repeat(80) + '\n');
    }

    // Interactive menu
    async showMenu() {
        console.log('\n' + '█'.repeat(80));
        console.log('  🎮 MANUAL URGENT ALARM TRIGGER - INTERACTIVE MODE');
        console.log('█'.repeat(80));

        console.log('\n📋 PREDEFINED SCENARIOS:\n');

        const scenarios = [
            { num: 1, source: 'Email', from: 'CTO@company.com', minutes: 20 },
            { num: 2, source: 'WhatsApp', from: 'Boss', minutes: 16 },
            { num: 3, source: 'Email', from: 'COO', minutes: 45 },
            { num: 4, source: 'WhatsApp', from: 'Mom', minutes: 22 },
            { num: 5, source: 'CUSTOM', from: 'CUSTOM', minutes: 15 }
        ];

        scenarios.forEach(s => {
            if (s.num < 5) {
                console.log(`${s.num}. ${s.source} from ${s.from} - Idle: ${s.minutes} min`);
            } else {
                console.log(`${s.num}. CUSTOM - Enter your own values`);
            }
        });

        console.log('\n0. EXIT\n');
    }

    // Custom input handler
    async getCustomInput() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question('\nEnter source (Email/WhatsApp): ', (source) => {
                rl.question('Enter sender name: ', (from) => {
                    rl.question('Enter idle minutes (15+): ', (minutes) => {
                        rl.close();
                        resolve({ source, from, minutes: parseInt(minutes) });
                    });
                });
            });
        });
    }
}

// Quick manual test
async function quickTest() {
    const trigger = new ManualAlarmTrigger();
    
    console.log('\n🚀 QUICK MANUAL TEST\n');
    
    // Scenario 1: Email from CTO
    trigger.setIdle(20);
    await trigger.triggerManualAlarm('Email', 'CTO@company.com', 20);
    
    // Wait 3 seconds
    await new Promise(r => setTimeout(r, 3000));
    
    // Scenario 2: WhatsApp from Boss
    trigger.setIdle(16);
    await trigger.triggerManualAlarm('WhatsApp', 'Boss', 16);
    
    console.log('\n✨ Quick test complete!');
}

// Standalone scenario
async function runScenario(num) {
    const trigger = new ManualAlarmTrigger();
    
    const scenarios = {
        1: { source: 'Email', from: 'CTO@company.com', minutes: 20 },
        2: { source: 'WhatsApp', from: 'Boss', minutes: 16 },
        3: { source: 'Email', from: 'COO', minutes: 45 },
        4: { source: 'WhatsApp', from: 'Mom', minutes: 22 }
    };
    
    const scenario = scenarios[num];
    if (!scenario) {
        console.log('❌ Invalid scenario number');
        return;
    }
    
    trigger.setIdle(scenario.minutes);
    await trigger.triggerManualAlarm(scenario.source, scenario.from, scenario.minutes);
}

// Export for use
module.exports = ManualAlarmTrigger;

// If run directly, show usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('\n📖 USAGE:\n');
        console.log('  node manual-trigger.js quick        - Run quick test with 2 scenarios');
        console.log('  node manual-trigger.js scenario 1   - Run predefined scenario 1');
        console.log('  node manual-trigger.js scenario 2   - Run predefined scenario 2');
        console.log('  node manual-trigger.js scenario 3   - Run predefined scenario 3');
        console.log('  node manual-trigger.js scenario 4   - Run predefined scenario 4');
        console.log('\n✅ PREDEFINED SCENARIOS:\n');
        console.log('  1. Email from CTO - 20 minutes idle');
        console.log('  2. WhatsApp from Boss - 16 minutes idle');
        console.log('  3. Email from COO - 45 minutes idle');
        console.log('  4. WhatsApp from Mom - 22 minutes idle\n');
    } else if (args[0] === 'quick') {
        quickTest();
    } else if (args[0] === 'scenario' && args[1]) {
        runScenario(parseInt(args[1]));
    } else {
        console.log('❌ Invalid arguments\n');
    }
}
