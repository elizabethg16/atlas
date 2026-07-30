const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

/**
 * Given raw scraped Wikipedia text, extract genuinely interesting facts -
 * strictly grounded in the provided text, in a plain factual voice.
 */
async function extractFacts(entityName, rawText, count = 6) {
  const prompt = `You are extracting facts for a geography reference app. Below is Wikipedia article text about "${entityName}".

GROUNDING RULES - these are strict, not suggestions:
- Only use information explicitly stated in the article text below. Do not add outside knowledge, even if you're confident it's true.
- Do not infer, estimate, or extrapolate anything not directly stated (no "likely," "probably," or filled-in numbers).
- If the article doesn't contain ${count} genuinely interesting facts, return fewer. Never pad with generic or repetitive statements to hit the count.
- Each fact must be traceable to a specific statement in the text below - if you can't point to the sentence it came from, don't include it.

VOICE RULES:
- Write in a plain, encyclopedic tone - like a well-edited reference book, not a chatbot.
- Do NOT start facts with phrases like "Did you know," "Interestingly," "Fun fact," "It's worth noting," or similar filler.
- Do NOT use hype adjectives like "vibrant," "rich," "stunning," "boasts," "renowned," or "must-see."
- State each fact directly and specifically. Prefer concrete numbers, dates, and names over vague description.
- Each fact should be a single, standalone sentence - no more than ~25 words.
- Rephrase in your own words rather than copying sentences verbatim from the source.

Extract up to ${count} facts that a curious, well-informed traveler wouldn't already know. Prefer unusual history, specific records, or distinctive geography over generic statistics.

Respond with ONLY a JSON array of strings, no other text, no markdown formatting.

Article text:
"""
${rawText.slice(0, 8000)}
"""`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].text.trim();

  try {
    const cleaned = raw.replace(/^```json\s*|```$/g, '').trim();
    const facts = JSON.parse(cleaned);
    if (!Array.isArray(facts)) throw new Error('Response was not an array');
    return facts;
  } catch (err) {
    console.error(`Failed to parse facts for ${entityName}:`, raw);
    throw err;
  }
}

module.exports = { extractFacts };
