import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

// Fallback question answering when AI service is unavailable
function fallbackAnswer(question: string, solution: string, scenario: string): string {
  const q = question.toLowerCase();
  const sol = solution.toLowerCase();
  const scen = scenario.toLowerCase();
  const fullText = sol + ' ' + scen;
  
  // Simple keyword-based answering
  // Check for death-related questions
  if (q.includes('die') || q.includes('dead') || q.includes('death') || q.includes('kill')) {
    if (fullText.includes('die') || fullText.includes('dead') || fullText.includes('death') || fullText.includes('kill')) {
      return 'YES';
    }
  }
  
  // Check for murder/suicide questions
  if (q.includes('murder') || q.includes('homicide')) {
    if (fullText.includes('murder') || fullText.includes('kill') || fullText.includes('shot') || fullText.includes('stab')) {
      return 'YES';
    }
    return 'NO';
  }
  
  if (q.includes('suicide') || q.includes('kill himself') || q.includes('kill herself')) {
    if (fullText.includes('suicide') || fullText.includes('hung himself') || fullText.includes('hung herself')) {
      return 'YES';
    }
    return 'NO';
  }
  
  // Check for accident questions
  if (q.includes('accident') || q.includes('accidental')) {
    if (fullText.includes('accident') || fullText.includes('accidental') || fullText.includes('failed') || fullText.includes('mistake')) {
      return 'YES';
    }
    return 'NO';
  }
  
  // Check for game-related questions (common in puzzles)
  if (q.includes('game') || q.includes('playing') || q.includes('monopoly') || q.includes('cards')) {
    if (fullText.includes('game') || fullText.includes('playing') || fullText.includes('monopoly') || fullText.includes('cards')) {
      return 'YES';
    }
    return 'NO';
  }
  
  // Check for real vs fake questions
  if (q.includes('real') || q.includes('actual') || q.includes('literal')) {
    if (q.includes('bicycle') || q.includes('bike')) {
      if (fullText.includes('playing cards') || fullText.includes('cards')) {
        return 'NO';
      }
    }
    if (q.includes('car') || q.includes('vehicle')) {
      if (fullText.includes('monopoly') || fullText.includes('playing piece')) {
        return 'NO';
      }
    }
  }
  
  // Check for playing cards
  if (q.includes('card') || q.includes('deck') || q.includes('playing')) {
    if (fullText.includes('cards') || fullText.includes('bicycle brand')) {
      return 'YES';
    }
    return 'NO';
  }
  
  // Check for cheating
  if (q.includes('cheat') || q.includes('cheating')) {
    if (fullText.includes('cheat')) {
      return 'YES';
    }
    return 'NO';
  }
  
  // Check for person/people
  if (q.includes('person') || q.includes('people') || q.includes('someone') || q.includes('anyone')) {
    if (q.includes('else')) {
      // "Is anyone else involved?"
      if (fullText.includes('player') || fullText.includes('friend') || fullText.includes('wife') || 
          fullText.includes('husband') || fullText.includes('bartender') || fullText.includes('someone')) {
        return 'YES';
      }
      return 'NO';
    }
  }
  
  // Check for wordplay/metaphor
  if (q.includes('wordplay') || q.includes('metaphor') || q.includes('different meaning')) {
    return 'YES';
  }
  
  // Check for weather
  if (q.includes('weather') || q.includes('rain') || q.includes('snow') || q.includes('sunny')) {
    return 'NOT RELEVANT';
  }
  
  // Check for time of day
  if (q.includes('morning') || q.includes('night') || q.includes('evening') || q.includes('afternoon')) {
    if (fullText.includes('morning') || fullText.includes('night') || fullText.includes('evening')) {
      return 'YES';
    }
    return 'NOT RELEVANT';
  }
  
  // Default: NOT RELEVANT for unclear questions
  return 'NOT RELEVANT';
}

export async function POST(request: NextRequest) {
  // Parse request body once at the beginning
  let requestBody;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }
  
  const { question, scenario, solution, conversationHistory } = requestBody;

  if (!question || !scenario || !solution) {
    return NextResponse.json(
      { success: false, error: 'Missing required fields' },
      { status: 400 }
    );
  }

  try {
    let zai;
    try {
      zai = await ZAI.create();
    } catch (initError) {
      console.log('SDK init failed, using fallback answer:', initError);
      // SDK initialization failed, use fallback
      const answer = fallbackAnswer(question, solution, scenario);
      return NextResponse.json({
        success: true,
        answer,
        _isFallback: true
      });
    }

    const systemPrompt = `You are the Game Master for a lateral thinking puzzle (yes/no game). 

THE SCENARIO:
${scenario}

THE ACTUAL SOLUTION:
${solution}

YOUR ROLE:
Answer the player's questions with ONLY one of these responses:
- "YES" - if the answer is definitively YES based on the solution
- "NO" - if the answer is definitively NO based on the solution
- "NOT RELEVANT" - if the question asks about something that doesn't exist or matter in the puzzle

================== CRITICAL: INTENT QUESTIONS ==================

Questions about INTENT, CAUSE, or NATURE of events are ALWAYS relevant:

INTENT QUESTIONS - Always answer YES or NO:
- "Did he die by accident?" → YES or NO based on solution
- "Did he kill himself?" → YES if suicide, NO if not
- "Was he murdered?" → YES if someone killed him, NO if not
- "Did someone else cause his death?" → YES or NO
- "Was it an accident?" → YES or NO
- "Did he mean to do it?" → YES or NO

NEVER say "NOT RELEVANT" to intent/cause questions!

================== WHEN TO USE "NOT RELEVANT" ==================

Use "NOT RELEVANT" when:
- The question asks about something that doesn't exist in the scenario
- The question is completely unrelated to the mystery
- The question introduces random concepts not connected to the solution

EXAMPLES:
- Puzzle: "A man is found dead with a half-eaten apple. Why?"
  - Q: "Was he poisoned?" → YES or NO (relevant!)
  - Q: "Did he die by accident?" → YES or NO (relevant!)
  - Q: "Was it raining?" → NOT RELEVANT (weather not involved)
  - Q: "Was he wearing a hat?" → NOT RELEVANT (hat not involved)

================== CONSISTENCY RULE ==================

Be ABSOLUTELY CONSISTENT with the solution. Never contradict facts.

================== PREVIOUS CONVERSATION ==================

${conversationHistory?.map((h: { question: string; answer: string }) => `Q: ${h.question}\nA: ${h.answer}`).join('\n') || 'None yet'}

Remember: ONLY respond with YES, NO, or NOT RELEVANT. Nothing else.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.1,
    });

    let answer = completion.choices[0]?.message?.content?.trim().toUpperCase() || 'NOT RELEVANT';
    
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
    
    // Try fallback for auth errors
    if (error instanceof Error && (error.message.includes('401') || error.message.includes('X-Token') || error.message.includes('403'))) {
      const answer = fallbackAnswer(question, solution, scenario);
      return NextResponse.json({
        success: true,
        answer,
        _isFallback: true
      });
    }
    
    if (error instanceof Error && error.message.includes('429')) {
      return NextResponse.json(
        { success: false, error: 'Rate limited. Please wait a moment.' },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to answer question' },
      { status: 500 }
    );
  }
}
