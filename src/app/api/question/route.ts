import { NextRequest, NextResponse } from 'next/server';
import { getAIConfig, AI_MODEL } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const { question, scenario, solution, conversationHistory } = await request.json();

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

    const systemPrompt = `You are the Game Master for a lateral thinking puzzle (yes/no game).

THE SCENARIO:
${scenario}

THE ACTUAL SOLUTION:
${solution}

YOUR ROLE:
Answer the player's questions with ONLY one of these responses:
- "YES" - if the answer is definitively YES
- "NO" - if the answer is definitively NO
- "NOT RELEVANT" - if the question asks about something that doesn't exist or matter

IMPORTANT RULES:
1. Questions about INTENT, CAUSE, or NATURE are ALWAYS relevant - answer YES or NO
2. Be CONSISTENT with the solution - never contradict facts
3. Don't say "NOT RELEVANT" to intent/cause questions like "Did he die by accident?" or "Was he murdered?"
4. Use "NOT RELEVANT" only for truly unrelated things (weather, clothing colors, etc.)

PREVIOUS QUESTIONS:
${historyText}

Remember: ONLY respond with YES, NO, or NOT RELEVANT. Nothing else.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

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
        max_tokens: 50
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
    let answer = responseJson.choices?.[0]?.message?.content?.trim().toUpperCase() || 'NOT RELEVANT';

    // Normalize the answer
    if (answer.includes('NOT RELEVANT') || answer.includes('NOT-RELEVANT') || answer.includes('IRRELEVANT')) {
      answer = 'NOT RELEVANT';
    } else if (answer.includes('YES')) {
      answer = 'YES';
    } else if (answer.includes('NO')) {
      answer = 'NO';
    } else {
      answer = 'NOT RELEVANT';
    }

    return NextResponse.json({
      success: true,
      answer
    });

  } catch (error) {
    console.error('Question answering error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to answer question.' },
      { status: 500 }
    );
  }
}
