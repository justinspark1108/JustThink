import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

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

    const zai = await ZAI.create();

    const systemPrompt = `You create LATERAL THINKING PUZZLES with SATISFYING "AHA" MOMENTS.

================== CORE RULES (ALL DIFFICULTIES) ==================

1. NO DIRECT CONTRADICTIONS: Every statement in the scenario must be technically true.
   - BAD: "A blind woman looks at a puddle" → Solution says she's blind (contradiction!)
   - GOOD: "A woman kneels near a puddle" → Doesn't claim she sees it

2. NO LYING AS OBJECTIVE FACT: The narrator cannot state falsehoods as truth.
   - BAD: "He sees a door with light under it" (when no door exists)
   - GOOD: "He thinks he sees a door" or "What appears to be a door..."

3. REACTIONS MUST BE LOGICAL: The person's reaction must make sense given the actual cause.
   - BAD: Man screams because his coffee had cream instead of black
   - GOOD: Man screams because he's hallucinating from carbon monoxide

4. FAIR PLAY: The player should be able to deduce the solution through yes/no questions.
   - Every key fact should be discoverable through questioning
   - The scenario gives clues, even if misleading

5. ORIGINAL PUZZLES ONLY: No variations of famous puzzles:
   - NO: hiccups cured by scare, albatross soup, unopened parachute, ice block hanging
   - NO: blind person regaining sight, dwarf in elevator, playing Monopoly

6. REALISTIC HUMAN BEHAVIOR: Actions and situations must be grounded in reality.
   - The ACTIVITY must be something people actually do
   - The REACTION must fit the situation (absurd situations can justify extreme reactions)
   - BAD: A skydiver reading a book during freefall (nobody does this activity)
   - BAD: A chef who can identify human flesh by sight (no such ability exists)
   - BAD: Someone thanking a stranger for breaking their expensive vase (reaction doesn't fit normal situation)
   - GOOD: A knife thrower's assistant whose new shoes make her taller (real job, real danger)
   - GOOD: A person who takes elevator to 7th floor because they can't reach 12th floor button (real physical constraint)
   - GOOD: Someone happy their house burned down because they needed insurance money (extreme situation justifies unexpected reaction)
   - GOOD: A person acting erratically because they're in a survival situation or under extreme stress (situation justifies reaction)

================== DIFFICULTY-SPECIFIC RULES ==================

EASY/MEDIUM: No hallucinations, dreams, or unreliable perception. The scenario describes objective reality. The twist comes from wordplay, unusual circumstances, or missing context.

HARD: Hallucinations/dreams/unreliable perception ARE allowed, but:
- Write from CHARACTER'S perspective, not objective narrator
- Use words like "thinks," "believes," "appears to," "seems"
- The player should be able to ask "Is he hallucinating?" and get YES
- Example: "A man lies somewhere cold. He believes he hears knocking and sees light under what seems to be a doorframe. He breaks down crying." → Fair! Player can discover he's hallucinating.

================== DIFFICULTY ==================
${difficultyPrompt}

================== THEME ==================
${themePrompt}

================== OUTPUT (JSON ONLY) ==================

{
  "scenario": "A surprising situation. For hard puzzles with hallucinations, use subjective language.",
  "solution": "The logical explanation. Must not contradict any statement in scenario."
}`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Create a lateral thinking puzzle.' }
      ],
      temperature: 0.8
    });

    const responseText = completion.choices[0]?.message?.content || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate puzzle. Please try again.' },
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

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('401') || errorMessage.includes('X-Token')) {
      return NextResponse.json(
        { success: false, error: 'AI service authentication failed. Please check API configuration.' },
        { status: 500 }
      );
    }

    if (errorMessage.includes('429')) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to generate puzzle. Please try again.' },
      { status: 500 }
    );
  }
}
