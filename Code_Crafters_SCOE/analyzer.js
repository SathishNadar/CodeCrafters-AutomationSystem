const { OpenAI } = require("openai");

// Use your HF token here
const client = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: "API_KEY", 
});

async function analyzeMessage(text) {
  try {
    const chatCompletion = await client.chat.completions.create({
      // ":fastest" is great for your need for speed!
      model: "Qwen/Qwen2.5-7B-Instruct:fastest",
      messages: [
        {
          role: "system",
          content: "You are a task extraction assistant. Identify tasks from emails. Respond ONLY in this format: TASK: [description], PRIORITY: [Low/Medium/High/Urgent], DEADLINE: [YYYY-MM-DD or None], SENDER : [sender of mail/System Alert/None]. If no task exists, respond with 'SKIP'."
        },
        {
          role: "user",
          content: `Extract from this email: ${text}`,
        },
      ],
      max_tokens: 150,
      temperature: 0.1, // Keep it precise for extraction
    });

    const result = chatCompletion.choices[0].message.content.trim();
    return result === "SKIP" ? null : result;

  } catch (error) {
    console.error("❌ Qwen AI Error:", error.message);
    return null;
  }
}

module.exports = { analyzeMessage };