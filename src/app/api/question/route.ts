import { NextRequest, NextResponse } from 'next/server';
import { getAIConfig, AI_MODEL } from '@/lib/config';

const HARD_SYSTEM_PROMPT = `You are the Game Master for a lateral thinking puzzle (yes/no game).

THE SCENARIO:
{scenario}

THE ACTUAL SOLUTION:
{solution}

YOUR ROLE:
Answer the player's questions with ONLY one of these responses:
- "YES" - if the answer is definitively YES
- "NO" - if the answer is definitively NO
- "NOT RELEVANT" - if the question asks about something that doesn't exist or matter

IMPORTANT RULES:
1. Questions about INTENT, CAUSE, or NATURE are ALWAYS relevant — answer YES or NO
2. Be CONSISTENT with the solution — never contradict facts
3. Don't say "NOT RELEVANT" to intent/cause questions like "Did he die by accident?" or "Was he murdered?"
4. Use "NOT RELEVANT" only for truly unrelated things (weather, clothing colors, etc.)

PREVIOUS QUESTIONS:
{history}

Remember: ONLY respond with YES, NO, or NOT RELEVANT. Nothing else.`;

const EASY_SYSTEM_PROMPT = `You are a friendly Game Master for a lateral thinking puzzle. You want the player to have fun and eventually solve it.

THE SCENARIO:
{scenario}

THE ACTUAL SOLUTION:
{solution}

YOUR ROLE:
Answer the player's questions, but ALSO give helpful hints to guide them. You are like a friend who knows the answer and is gently nudging them in the right direction.

FORMAT YOUR RESPONSES AS JSON:
{
  "answer": "YES" | "NO" | "NOT RELEVANT",
  "hint": "A short, helpful hint (1-2 sentences) OR null if no hint is needed"
}

HINT GUIDELINES:
- If their question is on the right track, say something encouraging like "You're heading in the right direction" or "Getting warmer"
- If they're going down a dead end, gently redirect: "That line of thinking might not lead anywhere — try asking about [specific area]"
- If they seem stuck, suggest a direction: "Try asking about [person's motivation/the setting/what happened before]"
- If they just asked something very relevant, confirm AND guide deeper: "Yes! Now think about WHY that happened"
- Don't give away the answer directly — guide them to discover it
- Not every response needs a hint — use your judgment
- Be warm and encouraging, like a fun dinner party host

IMPORTANT RULES:
1. Questions about INTENT, CAUSE, or NATURE are ALWAYS relevant — answer YES or NO
2. Be CONSISTENT with the solution — never contradict facts
3. Use "NOT RELEVANT" only for truly unrelated things

PREVIOUS QUESTIONS:
{history}

Return ONLY valid JSON. No markdown fences.`;

export async function POST(request: NextRequest) {
  try {
    const { question, scenario, solution, conversationHistory, mode = 'hard' } = await request.json();

    if (!question || !scenario || !solution) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const config = await getAIConfig();

    if (!config) {
      return NextResponse.json(
        { success: false, error: 'AI configuration not found. Set ZAI_BASE_URL and ZAI_API_KEY environment variables.' },
        { status: 500 }
      );
    }

    const historyText = conversationHistory?.length > 0
      ? conversationHistory.map((h: { question: string; answer: string }) => `Q: ${h.question}\nA: ${h.answer}`).join('\n')
      : 'None yet';

    const isEasy = mode === 'easy';

    const systemPrompt = isEasy
      ? EASY_SYSTEM_PROMPT
        .replace('{scenario}', scenario)
        .replace('{solution}', solution)
        .replace('{history}', historyText)
      : HARD_SYSTEM_PROMPT
        .replace('{scenario}', scenario)
        .replace('{solution}', solution)
        .replace('{history}', historyText);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), isEasy ? 20000 : 15000);

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ],
        temperature: 0.1,
        max_tokens: isEasy ? 200 : 50
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const responseDataRaw = await response.text();

    if (!response.ok) {
      console.error('Question API Error:', response.status, responseDataRaw.substring(0, 200));
      return NextResponse.json(
        { success: false, error: `API Error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const responseJson = JSON.parse(responseDataRaw);
    let rawContent = responseJson.choices?.[0]?.message?.content?.trim() || '';

    if (isEasy) {
      // Easy mode: parse JSON with answer + hint
      rawContent = rawContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          let answer = 'NOT RELEVANT';

          if (parsed.answer) {
            const upper = parsed.answer.toUpperCase();
            if (upper.includes('NOT RELEVANT') || upper.includes('IRRELEVANT')) {
              answer = 'NOT RELEVANT';
            } else if (upper.includes('YES')) {
              answer = 'YES';
            } else if (upper.includes('NO')) {
              answer = 'NO';
            }
          }

          return NextResponse.json({
            success: true,
            answer,
            hint: parsed.hint || null
          });
        } catch {
          // Fall through to hard mode parsing
        }
      }

      // Fallback: treat as hard mode if JSON parse failed
      const upper = rawContent.toUpperCase();
      let answer = 'NOT RELEVANT';
      if (upper.includes('NOT RELEVANT') || upper.includes('IRRELEVANT')) {
        answer = 'NOT RELEVANT';
      } else if (upper.includes('YES')) {
        answer = 'YES';
      } else if (upper.includes('NO')) {
        answer = 'NO';
      }
      return NextResponse.json({ success: true, answer, hint: null });
    }

    // Hard mode: strict YES/NO/NOT RELEVANT
    let answer = rawContent.toUpperCase();
    if (answer.includes('NOT RELEVANT') || answer.includes('NOT-RELEVANT') || answer.includes('IRRELEVANT')) {
      answer = 'NOT RELEVANT';
    } else if (answer.includes('YES')) {
      answer = 'YES';
    } else if (answer.includes('NO')) {
      answer = 'NO';
    } else {
      answer = 'NOT RELEVANT';
    }

    return NextResponse.json({ success: true, answer });

  } catch (error) {
    console.error('Question answering error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to answer question.' },
      { status: 500 }
    );
  }
}
