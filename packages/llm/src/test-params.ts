import OpenAI from "openai";

const c = new OpenAI({
  apiKey: process.env.LLM_API_KEY!,
  baseURL: "https://api.siliconflow.cn/v1",
});

console.log("Test 1: same as LLMClient default (max_tokens=2048, temperature=0.3):");
try {
  const r = await c.chat.completions.create({
    model: "Pro/MiniMaxAI/MiniMax-M2.5",
    messages: [{role: "user", content: "say ok"}],
    temperature: 0.3,
    max_tokens: 2048,
  });
  console.log("  OK:", r.choices[0]?.message?.content);
} catch (e: any) {
  console.log("  ERR:", e.message, "|", e.code, "|", e.cause?.code, e.cause?.message);
}

console.log("Test 2: with stop=undefined and response_format=undefined:");
try {
  const r = await c.chat.completions.create({
    model: "Pro/MiniMaxAI/MiniMax-M2.5",
    messages: [{role: "user", content: "say ok"}],
    temperature: 0.3,
    max_tokens: 2048,
    stop: undefined,
    response_format: undefined,
  });
  console.log("  OK:", r.choices[0]?.message?.content);
} catch (e: any) {
  console.log("  ERR:", e.message, "|", e.code, "|", e.cause?.code);
}
