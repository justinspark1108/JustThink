import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

// Fallback solution evaluation when AI service is unavailable
function fallbackEvaluate(userSolution: string, actualSolution: string, scenario: string): { status: 'correct' | 'partial' | 'incorrect'; accuracy: number; feedback: string; missingElements: string[] } {
  const user = userSolution.toLowerCase();
  const actual = actualSolution.toLowerCase();
  const scen = scenario.toLowerCase();
  
  // Extract key concepts from the actual solution
  const keyWords = actual.split(/\s+/).filter(w => w.length > 3);
  const importantPhrases: string[] = [];
  
  // Extract phrases in quotes or key terms
  const phraseMatches = actual.match(/"([^"]+)"|'([^']+)'/g);
  if (phraseMatches) {
    phraseMatches.forEach(p => importantPhrases.push(p.replace(/['"]/g, '').toLowerCase()));
  }
  
  // Count matching keywords
  let matchCount = 0;
  const matchedWords: string[] = [];
  const missedWords: string[] = [];
  
  keyWords.forEach(word => {
    if (user.includes(word)) {
      matchCount++;
      matchedWords.push(word);
    } else if (word.length > 4) {
      missedWords.push(word);
    }
  });
  
  // Check for important phrases
  let phraseMatches_count = 0;
  importantPhrases.forEach(phrase => {
    if (user.includes(phrase)) {
      phraseMatches_count++;
    }
  });
  
  // Calculate accuracy
  let accuracy = 0;
  
  if (keyWords.length > 0) {
    accuracy = Math.round((matchCount / keyWords.length) * 100);
  }
  
  // Boost accuracy if key phrases are matched
  if (importantPhrases.length > 0 && phraseMatches_count > 0) {
    accuracy = Math.min(100, accuracy + (phraseMatches_count / importantPhrases.length) * 20);
  }
  
  // Check for semantic equivalence (common puzzle patterns)
  const semanticMatches = [
    // Card/bicycle connection
    { patterns: [['bicycle', 'card', 'playing'], ['bicycle', 'deck', 'card']], boost: 30 },
    // Game/monopoly connection
    { patterns: [['monopoly', 'game', 'playing'], ['hotel', 'bankrupt', 'car']], boost: 30 },
    // Height/dwarf connection  
    { patterns: [['dwarf', 'short', 'height', 'button'], ['elevator', 'floor', 'umbrella']], boost: 30 },
    // Ice/cold connection
    { patterns: [['ice', 'frozen', 'melt', 'water'], ['hang', 'puddle']], boost: 30 },
  ];
  
  semanticMatches.forEach(({ patterns, boost }) => {
    const allPatterns = patterns.flat();
    const userMatches = allPatterns.filter(p => user.includes(p)).length;
    const solutionMatches = allPatterns.filter(p => actual.includes(p)).length;
    if (userMatches >= 2 && solutionMatches >= 2) {
      accuracy = Math.min(100, accuracy + boost);
    }
  });
  
  // Determine status
  let status: 'correct' | 'partial' | 'incorrect';
  if (accuracy >= 85) {
    status = 'correct';
  } else if (accuracy >= 50) {
    status = 'partial';
  } else {
    status = 'incorrect';
  }
  
  // Generate feedback
  let feedback = '';
  const missingElements: string[] = [];
  
  if (status === 'correct') {
    feedback = 'Excellent! You solved it!';
  } else if (status === 'partial') {
    feedback = 'You\'re on the right track! Keep thinking.';
    if (missedWords.length > 0) {
      missingElements.push(`Think about: ${missedWords.slice(0, 3).join(', ')}`);
    }
  } else {
    feedback = 'Not quite. Try asking more questions first.';
    if (missedWords.length > 0) {
      missingElements.push(`Key concepts: ${missedWords.slice(0, 3).join(', ')}`);
    }
  }
  
  return {
    status,
    accuracy,
    feedback,
    missingElements: missingElements.slice(0, 3)
  };
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
  
  const { userSolution, actualSolution, solutionSummary, scenario } = requestBody;

  if (!userSolution || !actualSolution || !scenario) {
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
      console.log('SDK init failed, using fallback evaluation:', initError);
      // SDK initialization failed, use fallback
      const evaluation = fallbackEvaluate(userSolution, actualSolution, scenario);
      return NextResponse.json({
        success: true,
        evaluation: {
          ...evaluation,
          isCorrect: evaluation.status === 'correct',
          _isFallback: true
        }
      });
    }

    const systemPrompt = `You are evaluating a player's solution to a lateral thinking puzzle.

THE ORIGINAL SCENARIO:
${scenario}

THE CORRECT SOLUTION:
${actualSolution}

THE PLAYER'S SUBMITTED SOLUTION:
${userSolution}

Your task is to evaluate how close the player's solution is to the actual solution.

RESPOND IN JSON FORMAT:
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
- Don't penalize for missing minor details if the core is there
- The goal is to reward good thinking, not perfect recall

Example: If the answer is "He realized he ate his wife on the island" and they say "He realized the meat wasn't albatross" - that's 90%+ correct.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Please evaluate my solution.' }
      ],
      temperature: 0.2,
    });

    const responseText = completion.choices[0]?.message?.content || '';
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse evaluation response');
    }

    const evaluation = JSON.parse(jsonMatch[0]);

    // Determine result status (lowered threshold for "correct")
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
    
    // Try fallback for auth errors
    if (error instanceof Error && (error.message.includes('401') || error.message.includes('X-Token') || error.message.includes('403'))) {
      const evaluation = fallbackEvaluate(userSolution, actualSolution, scenario);
      return NextResponse.json({
        success: true,
        evaluation: {
          ...evaluation,
          isCorrect: evaluation.status === 'correct',
          _isFallback: true
        }
      });
    }
    
    if (error instanceof Error && error.message.includes('429')) {
      return NextResponse.json(
        { success: false, error: 'Rate limited. Please wait a moment.' },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to evaluate solution' },
      { status: 500 }
    );
  }
}
