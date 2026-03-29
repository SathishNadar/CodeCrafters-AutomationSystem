# 🚨 Urgent Escalation Alarm - Implementation Guide

## Overview
The **Urgent Escalation Alarm** rule now includes complete sound + notification functionality with proper condition checking.

---

## ✅ Implementation Complete

### What Was Added to `rules-engine.js`:

#### 1. **Idle Time Tracking**
```javascript
const IDLE_THRESHOLD = 15 * 60 * 1000; // 15 minutes
let idleStartTime = null;
```
- Tracks when user becomes idle
- Measures how long they've been away

#### 2. **Sound Playback Function**
```javascript
function playBeep(frequency = 800, duration = 300)
```
- Uses Windows PowerShell to play system beep
- Customizable frequency (Hz) and duration (ms)

#### 3. **Urgent Alarm Trigger**
```javascript
async function triggerUrgentAlarm(notificationData)
```
- **Checks ALL 3 conditions:**
  1. ✅ User IDLE for 15+ minutes
  2. ✅ rule_urgent_alarm is ACTIVE
  3. ✅ Priority notification arrives
  
- **If all met:**
  - 🔊 Plays alarm beep sequence (3 beeps)
  - 📢 Sends Windows notification with message

#### 4. **Idle Tracking Function**
```javascript
function updateIdleTracking(isIdle)
```
- Called when user enters/exits idle state
- Logs idle duration when state changes

---

## 🔄 How It Works in Real Application

```
User is IDLE
    ↓
[15 minutes pass]
    ↓
URGENT notification arrives (Email/WhatsApp)
    ↓
System checks 3 conditions:
  ✅ isIdle = true
  ✅ idleTime >= 15 minutes
  ✅ rule_urgent_alarm = true
    ↓
✅ CONDITIONS MET
    ↓
1. 🔊 Play beep alarm (3x)
2. 📢 Send Windows notification
```

---

## 🧪 Testing

### Run Realistic Test:
```bash
node test-urgent-alarm-realistic.js
```

### Expected Output:
- ✅ All 3 conditions validated
- 🔊 3 beep sounds played to speaker
- 📢 Windows notification shown
- 📬 Incoming messages displayed

---

## 📡 Usage in Application

When a priority notification arrives (handled by notificationManager or similar):

```javascript
const rulesEngine = require('./rules-engine.js');

// When URGENT notification arrives:
rulesEngine.triggerUrgentAlarm({
    source: 'WhatsApp',      // or 'Email'
    from: 'Boss',            // Contact name
    priority: 'URGENT'
});
```

The function will:
1. Check all conditions
2. Play alarm if conditions met
3. Send notification
4. Log all actions

---

## 🎯 Condition Details

| Condition | Required | Current | Status |
|-----------|----------|---------|--------|
| User Idle | 15+ min | Tracked in `idleStartTime` | ✅ Working |
| Rule Active | rule_urgent_alarm = true | Checked in the trigger function | ✅ Working |
| Priority | URGENT notifications | Passed as `notificationData` | ✅ Working |

---

## 🔊 Alarm Characteristics

- **Pattern**: 3 beeps (800Hz, 800Hz, 1000Hz)
- **Duration**: ~850ms total
- **Sound Device**: System speaker
- **Notification**: Windows notification (critical urgency, never timeout)
- **Can be**: Customized by modifying `alarmPattern` and `triggerUrgentAlarm()`

---

## 📋 Files Modified

1. **rules-engine.js**
   - Added import: `const { exec } = require('child_process');`
   - Added constants and variables for idle tracking
   - Added 3 new functions: `playBeep()`, `triggerUrgentAlarm()`, `updateIdleTracking()`
   - Updated `updateContext()` to track idle changes
   - Exports new functions

2. **test-urgent-alarm-realistic.js** (NEW)
   - Comprehensive test with all 3 conditions
   - Simulates 16-minute idle period
   - Triggers alarm and shows expected behavior

---

## 🚀 Next Steps

1. **Integrate with notification handler**: Call `triggerUrgentAlarm()` when priority notifications arrive
2. **Test in Electron app**: Run full application to verify Windows notifications work
3. **Customize thresholds**: Adjust `IDLE_THRESHOLD` if needed
4. **Customize alarm pattern**: Modify beep frequencies if desired

---

## 💡 Notes

- All beep sounds play through **system speaker**
- Idle time tracking works independently of rule being active
- Alarm only triggers if ALL conditions are met
- Can handle multiple URGENT messages (alarm plays for each if conditions remain met)

