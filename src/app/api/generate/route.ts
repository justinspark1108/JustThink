import { NextRequest, NextResponse } from 'next/server';
import { getAIConfig, AI_MODEL } from '@/lib/config';

const DIFFICULTY_PROMPTS: Record<string, string> = {
  easy: `SOLVABLE IN ABOUT 5-10 QUESTIONS. One surprising fact. Instant "aha" when discovered. NO hallucinations, dreams, or unreliable narrators.`,
  medium: `SOLVABLE IN ABOUT 15-25 QUESTIONS. Two connected facts to discover. Straightforward reality with a twist.`,
  hard: `SOLVABLE IN 30+ QUESTIONS. Multiple layers to uncover. MAY include hallucinations, dreams, or unreliable perception - but ONLY if written carefully (see rules below).`
};

const THEME_PROMPTS: Record<string, string> = {
  mystery: `Something unexplained with a logical reveal.`,
  logic: `A situation that makes sense once you understand the context.`,
  survival: `Someone in danger - the reason becomes clear through questioning.`,
  horror: `A dark scenario with a chilling but logical explanation.`,
  crime: `A suspicious event with a clear explanation.`
};

export async function POST(request: NextRequest) {
  try {
    const { difficulty, theme } = await request.json();

    const difficultyPrompt = DIFFICULTY_PROMPTS[difficulty] || DIFFICULTY_PROMPTS.medium;
    const themePrompt = THEME_PROMPTS[theme] || THEME_PROMPTS.mystery;

    const config = await getAIConfig();

    if (!config) {
      return NextResponse.json(
        { success: false, error: 'AI configuration not found. Set ZAI_BASE_URL and ZAI_API_KEY environment variables, or create a .z-ai-config file.' },
        { status: 500 }
      );
    }

    const systemPrompt = `You create lateral thinking puzzles with satisfying "aha" moments.

DIFFICULTY: ${difficultyPrompt}
THEME: ${themePrompt}

RULES:
1. The scenario describes a surprising situation - NOT the solution
2. The solution must be discoverable through yes/no questions
3. No direct contradictions - scenario must be technically true
4. No lying as objective fact - narrator cannot state falsehoods
5. Reactions must logically fit the cause
6. Solution must give a clear "aha" moment
7. Be original - no famous puzzle variations
8. Keep the scenario concise (2-3 sentences)

Return ONLY valid JSON, no markdown fences, no explanation:
{"scenario": "A surprising situation.", "solution": "The logical explanation."}`;

    const userPrompt = `Create a ${difficulty} ${theme} lateral thinking puzzle. Return ONLY the JSON object.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

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
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 2000
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const responseDataRaw = await response.text();

    if (!response.ok) {
      console.error('Generate API Error:', response.status, responseDataRaw.substring(0, 300));
      return NextResponse.json(
        { success: false, error: `API Error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const responseJson = JSON.parse(responseDataRaw);
    const message = responseJson.choices?.[0]?.message || {};
    let content = message.content || '';
    const reasoningContent = message.reasoning_content || '';

    // Fallback: extract JSON from reasoning content if main content is empty
    if (!content.trim() && reasoningContent) {
      const jsonMatch = reasoningContent.match(/\{[\s\S]*"scenario"[\s\S]*?"solution"[\s\S]*?\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
    }

    if (!content.trim()) {
      console.error('No usable content from model');
      return NextResponse.json(
        { success: false, error: 'AI model returned empty response. Please try again.' },
        { status: 500 }
      );
    }

    // Strip markdown code fences if present
    content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    // Extract JSON object
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found:', content.substring(0, 200));
      return NextResponse.json(
        { success: false, error: 'AI response did not contain valid JSON.' },
        { status: 500 }
      );
    }

    const puzzle = JSON.parse(jsonMatch[0]);

    if (!puzzle.scenario || !puzzle.solution) {
      return NextResponse.json(
        { success: false, error: 'Invalid puzzle format. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      puzzle: {
        id: Date.now().toString(),
        scenario: puzzle.scenario,
        difficulty,
        theme,
        solution: puzzle.solution
      }
    });

  } catch (error) {
    console.error('Puzzle generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate puzzle. Please try again.' },
      { status: 500 }
    );
  }
}
