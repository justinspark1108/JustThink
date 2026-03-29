import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { userSolution, actualSolution, scenario } = await request.json();

    if (!userSolution || !actualSolution || !scenario) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const zai = await ZAI.create();

    const systemPrompt = `You are evaluating a player's solution to a lateral thinking puzzle.

THE ORIGINAL SCENARIO:
${scenario}

THE CORRECT SOLUTION:
${actualSolution}

THE PLAYER'S SUBMITTED SOLUTION:
${userSolution}

Evaluate how close the player's solution is to the actual solution.

Respond in JSON format only:
{
  "isCorrect": true or false,
  "accuracy": 0-100,
  "feedback": "A brief, encouraging message (under 100 chars). If partial, hint at what's missing.",
  "missingElements": ["any key elements they missed"]
}

SCORING GUIDELINES - BE GENEROUS:
- 95-100%: They got the core idea and key details. Minor wording differences don't matter.
- 80-94%: They understood the main concept but missed some details
- 60-79%: They're on the right track, partially correct
- 40-59%: They got some elements right but the core is wrong
- 0-39%: Not correct

IMPORTANT:
- If they got the MAIN IDEA right, give them at least 85%
- Semantic similarity counts - different words, same meaning = correct
- Don't penalize for missing minor details if the core is there`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Please evaluate my solution.' }
      ],
      temperature: 0.2
    });

    const responseText = completion.choices[0]?.message?.content || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json(
        { success: false, error: 'Failed to evaluate solution.' },
        { status: 500 }
      );
    }

    const evaluation = JSON.parse(jsonMatch[0]);

    // Determine result status
    let status: 'correct' | 'partial' | 'incorrect';
    if (evaluation.accuracy >= 85) {
      status = 'correct';
    } else if (evaluation.accuracy >= 50) {
      status = 'partial';
    } else {
      status = 'incorrect';
    }

    return NextResponse.json({
      success: true,
      evaluation: {
        ...evaluation,
        status
      }
    });

  } catch (error) {
    console.error('Solution evaluation error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('401') || errorMessage.includes('X-Token')) {
      return NextResponse.json(
        { success: false, error: 'AI service authentication failed.' },
        { status: 500 }
      );
    }

    if (errorMessage.includes('429')) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to evaluate solution.' },
      { status: 500 }
    );
  }
}
