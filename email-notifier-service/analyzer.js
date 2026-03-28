const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { OpenAI } = require("openai");

const client = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: process.env.HF_API_KEY, 
});

/**
 * Parses the Qwen response into a structured object.
 */
function parseAnalysis(text) {
  if (!text || text === "SKIP") return null;
  
  const result = {
    task: "Unknown Task",
    priority: "Medium",
    deadline: "None",
    sender: "Unknown"
  };

  const parts = text.split(',');
  parts.forEach(part => {
    const [key, ...valueParts] = part.split(':');
    const value = valueParts.join(':').trim();
    if (key.includes('TASK')) result.task = value;
    else if (key.includes('PRIORITY')) result.priority = value;
    else if (key.includes('DEADLINE')) result.deadline = value;
    else if (key.includes('SENDER')) result.sender = value;
  });

  return result;
}

async function analyzeMessage(text) {
  try {
    const chatCompletion = await client.chat.completions.create({
      model: "Qwen/Qwen2.5-7B-Instruct:fastest",
      messages: [
        {
          role: "system",
          content: "You are a task extraction assistant. Identify tasks from emails. Respond ONLY in this format: TASK: [description], PRIORITY: [Low/Medium/High/Urgent], DEADLINE: [YYYY-MM-DD or None], SENDER : [sender email/None]. If no task exists, respond with 'SKIP'."
        },
        {
          role: "user",
          content: `Extract from this email: ${text}`,
        },
      ],
      max_tokens: 150,
      temperature: 0.1,
    });

    const responseText = chatCompletion.choices[0].message.content.trim();
    return parseAnalysis(responseText);

  } catch (error) {
    console.error("❌ Qwen AI Error:", error.message);
    return null;
  }
}

module.exports = { analyzeMessage };