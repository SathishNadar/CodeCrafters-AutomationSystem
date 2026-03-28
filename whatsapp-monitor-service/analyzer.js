const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { OpenAI } = require('openai');

const client = new OpenAI({
    baseURL: 'https://router.huggingface.co/v1',
    apiKey: process.env.HF_API_KEY,
});

/**
 * Parses the Qwen response into a structured object.
 * Expected format: "TASK: [desc], PRIORITY: [Low/Medium/High], SENDER: [name]"
 */
function parseAnalysis(text) {
    if (!text || text === 'SKIP') return null;

    const result = {
        task: 'No specific task',
        priority: 'Medium',
        sender: 'Unknown'
    };

    const parts = text.split(',');
    parts.forEach(part => {
        const [key, ...valueParts] = part.split(':');
        const value = valueParts.join(':').trim();
        const k = key.trim().toUpperCase();
        if (k.includes('TASK')) result.task = value || 'General message';
        else if (k.includes('PRIORITY')) result.priority = value || 'Medium';
        else if (k.includes('SENDER')) result.sender = value || 'Unknown';
    });

    // Normalize priority to exact casing
    const p = result.priority.toLowerCase();
    if (p.includes('high')) result.priority = 'High';
    else if (p.includes('medium') || p.includes('med')) result.priority = 'Medium';
    else result.priority = 'Low';

    return result;
}

/**
 * Classifies a WhatsApp message using Qwen AI.
 * Returns { task, priority, sender } or null if classification fails.
 *
 * @param {string} messageBody - The raw WhatsApp message text
 * @param {string} contactName - Display name of the sender contact
 */
async function analyzeWhatsAppMessage(messageBody, contactName) {
    try {
        const chatCompletion = await client.chat.completions.create({
            model: 'Qwen/Qwen2.5-7B-Instruct:fastest',
            messages: [
                {
                    role: 'system',
                    content: `You are a WhatsApp message classifier for a busy developer.
Classify each message and respond ONLY in this format:
TASK: [brief task description or None], PRIORITY: [Low/Medium/High], SENDER: [${contactName}]

Classification guidelines:
- Casual greetings, emojis, "ok", "lol", "good morning" → PRIORITY: Low, TASK: None
- Meeting requests, sharing links, general questions, "can we talk?" → PRIORITY: Medium
- Words like URGENT, ASAP, "server down", "deploy failed", "need help NOW", "not working", "critical", "production issue" → PRIORITY: High
- Payment requests, deadlines today, "call me right now" → PRIORITY: High
When in doubt, use Medium.`
                },
                {
                    role: 'user',
                    content: `Classify this WhatsApp message from ${contactName}: "${messageBody}"`
                }
            ],
            max_tokens: 80,
            temperature: 0.1,
        });

        const responseText = chatCompletion.choices[0].message.content.trim();
        return parseAnalysis(responseText);

    } catch (error) {
        console.error('[WhatsAppAnalyzer] ❌ Qwen AI Error:', error.message);
        // Fallback: return a basic Medium classification so the message still appears in the inbox
        return {
            task: messageBody.substring(0, 60) + (messageBody.length > 60 ? '...' : ''),
            priority: 'Medium',
            sender: contactName
        };
    }
}

module.exports = { analyzeWhatsAppMessage };
