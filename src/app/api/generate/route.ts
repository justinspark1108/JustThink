import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

// Fallback puzzles for when AI service is unavailable
const FALLBACK_PUZZLES = {
  easy: [
    {
      scenario: "A man pushes his car to a hotel and tells the owner he's bankrupt. Why?",
      solution: "He's playing Monopoly. The car is his playing piece, and he's landed on a property he can't afford to pay rent for.",
      theme: "logic"
    },
    {
      scenario: "A woman buys a new pair of shoes, goes to work, and dies. Why?",
      solution: "She works as an assistant to a knife thrower. The new shoes have higher heels than her old ones, making her taller. The knife thrower didn't account for this and accidentally killed her.",
      theme: "mystery"
    },
    {
      scenario: "A man is lying dead in a field. Next to him is an unopened package. There is no other creature in the field. How did he die?",
      solution: "The man jumped from a plane, but his parachute (the unopened package) failed to open.",
      theme: "mystery"
    }
  ],
  medium: [
    {
      scenario: "Kolya clapped his hands, and everyone else in the room died. What happened?",
      solution: "Kolya was in a room full of mosquitoes. When he clapped his hands, he killed all the mosquitoes. 'Everyone' referred to the mosquitoes, not people.",
      theme: "logic"
    },
    {
      scenario: "A woman is found dead in a room with 53 bicycles. What happened?",
      solution: "The 'bicycles' are playing cards (Bicycle brand). She was caught cheating in a card game and was killed by the other players.",
      theme: "crime/detective"
    },
    {
      scenario: "A man lives on the 12th floor of an apartment building. Every morning he takes the elevator down to go to work. When he returns, he takes the elevator to the 7th floor and walks up the stairs to reach his apartment on the 12th floor. Why?",
      solution: "The man is a dwarf. He can't reach the button for the 12th floor, but he can reach the 7th floor button. On days when it's raining, he has an umbrella and can use that to press the 12th floor button.",
      theme: "logic"
    }
  ],
  hard: [
    {
      scenario: "A man is found dead in a locked room with a puddle of water on the floor. The only other thing in the room is a table. How did he die?",
      solution: "He stood on a block of ice to hang himself. The ice melted, leaving only the puddle of water. The table was what he tied the rope to.",
      theme: "mystery"
    },
    {
      scenario: "A woman comes home, sees her husband dead on the floor, and immediately calls the police. The police find no weapon, no signs of forced entry, and the wife had no motive. How did the husband die?",
      solution: "The husband was an ice sculptor. He had created a self-supporting ice structure that fell on him and crushed him. The ice melted before anyone arrived, leaving no trace of the 'weapon.'",
      theme: "mystery"
    },
    {
      scenario: "A man walks into a bar and asks for a glass of water. The bartender pulls out a gun and points it at him. The man says 'Thank you' and walks out. What happened?",
      solution: "The man had hiccups. The bartender recognized this and scared him with the gun to cure the hiccups. It worked, so the man thanked him and left.",
      theme: "logic"
    }
  ]
};

const DIFFICULTY_PROMPTS: Record<string, string> = {
  easy: `SOLVABLE IN ABOUT 5 QUESTIONS. ONE surprising fact. Instant "aha" when discovered.`,
  medium: `SOLVABLE IN ABOUT 20 QUESTIONS. Two connected facts to discover.`,
  hard: `SOLVABLE IN 30+ QUESTIONS. A compelling mystery with ONE core twist.`
};

const THEME_PROMPTS: Record<string, string> = {
  mystery: `Something unexplained with a logical reveal.`,
  logic: `A situation that makes sense once you understand the context.`,
  survival: `Someone in danger - the reason becomes clear through questioning.`,
  'horror/dark': `A dark scenario with a chilling but logical explanation.`,
  'crime/detective': `A suspicious event with a clear explanation.`
};

// Banned overused puzzle patterns
const BANNED_PATTERNS = [
  /hiccups?.*(water|gun|bartender|scare)/i,
  /albatross|soup.*wife|ate.*wife/i,
  /unopened.*package|parachute.*fail/i,
  /puddle.*water.*hang|ice.*block.*hang/i,
  /blind.*(restaurant|waiter|gun)/i,
  /bartender.*gun.*thanks/i,
  /blind.*(regained|got.*sight|first.*time.*see)/i,  // blind person suddenly seeing
  /convertible.*top.*down.*shot/i,  // convertible shooting
];

// Quick validation checks (no API call)
function quickValidate(scenario: string, solution: string): { valid: boolean; reason: string } {
  const fullText = scenario + ' ' + solution;
  const lowerScenario = scenario.toLowerCase();
  const lowerSolution = solution.toLowerCase();
  
  // Check for banned patterns
  if (BANNED_PATTERNS.some(pattern => pattern.test(fullText))) {
    return { valid: false, reason: 'Puzzle too similar to well-known classics' };
  }
  
  // Check for common contradiction patterns
  // "for his wife" vs "for his mistress"
  if (lowerScenario.includes('for his wife') && lowerSolution.includes('mistress')) {
    return { valid: false, reason: 'Contradiction: scenario says for wife, solution says mistress' };
  }
  
  // "sealed" vs "fell through"
  if (lowerScenario.includes('sealed') && lowerSolution.includes('fell through')) {
    return { valid: false, reason: 'Contradiction: sealed window vs fell through' };
  }
  
  // Too short/weak
  if (solution.length < 30) {
    return { valid: false, reason: 'Solution too short/weak' };
  }
  
  // No real puzzle element
  if (!scenario.includes('?') && !lowerScenario.includes('why') && !lowerScenario.includes('how') && !lowerScenario.includes('what happened')) {
    return { valid: false, reason: 'Scenario should end with a question' };
  }
  
  // Check for non-puzzles (actions that are just normal behavior)
  const normalBehaviors = [
    { pattern: /hands.*full|grocer/i, reason: 'Not a puzzle - just normal behavior (hands full)' },
    { pattern: /thank.*because.*broken.*revealed|thank.*for.*breaking/i, reason: 'Illogical - thanking someone for breaking your property' },
    { pattern: /return.*bottle.*deposit|bottle.*return/i, reason: 'Not a puzzle - just normal bottle return' },
    { pattern: /throw.*away.*because.*ex|threw away.*ex's/i, reason: 'Not a puzzle - normal emotional behavior' },
  ];
  
  for (const check of normalBehaviors) {
    if (check.pattern.test(fullText)) {
      return { valid: false, reason: check.reason };
    }
  }
  
  // Check for logical absurdities
  const absurdities = [
    { pattern: /chef.*recogni(s|z)ed.*human.*flesh/i, reason: 'Absurd - no chef can identify human flesh by sight' },
    { pattern: /muscle.*memory.*caused.*shoot/i, reason: 'Absurd - muscle memory doesnt cause shooting yourself' },
    { pattern: /test.*brake.*cliff|testing.*brakes.*drive.*off/i, reason: 'Absurd - testing brakes means stopping, not driving off cliff' },
    { pattern: /umbrella.*reach.*window/i, reason: 'Absurd - umbrellas dont help reach high windows' },
    { pattern: /reflection.*thought.*someone.*track/i, reason: 'Illogical - seeing reflection doesnt make you jump off train' },
    { pattern: /cream.*sugar.*scream|wrong.*coffee.*scream/i, reason: 'Absurd - drinking wrong coffee doesnt make people scream' },
    { pattern: /encrypt.*radio.*bank|radio.*encrypt.*messag/i, reason: 'Too contrived - normal people dont decode encrypted radio messages' },
    { pattern: /hid.*in.*store.*bag|hidden.*in.*store/i, reason: 'Illogical - you cant hide things in random store products' },
    { pattern: /jump.*build.*surviv/i, reason: 'Misleading - jumping between ledges is not "jumping off building"' },
    { pattern: /soil.*analy.*mortgage|sand.*mortgage|geo.*loan/i, reason: 'Absurd - soil analysis is not a mortgage requirement' },
    { pattern: /hit.*pedestrian.*cure|car.*hit.*cure.*hiccup/i, reason: 'Absurd - doctors dont agree to be hit by cars to cure hiccups' },
    { pattern: /hiccups?.*(scare|shock|cure)/i, reason: 'Overused - hiccups cure is a banned classic' },
  ];
  
  for (const check of absurdities) {
    if (check.pattern.test(fullText)) {
      return { valid: false, reason: check.reason };
    }
  }
  
  // Solution should have a clear "because" or causal explanation
  if (!lowerSolution.includes('because') && !lowerSolution.includes('since') && !lowerSolution.includes('was a') && !lowerSolution.includes('were ')) {
    return { valid: false, reason: 'Solution lacks causal explanation' };
  }
  
  return { valid: true, reason: '' };
}

// Generate a single puzzle with self-validation built into the prompt
async function generatePuzzle(zai: any, difficultyPrompt: string, themePrompt: string, attemptNumber: number): Promise<any> {
  const attemptHint = attemptNumber > 1 ? `\n\nNOTE: This is attempt #${attemptNumber}. Your previous puzzle was rejected. Please create a DIFFERENT, BETTER puzzle.` : '';
  
  const systemPrompt = `You create LATERAL THINKING PUZZLES with SATISFYING "AHA" MOMENTS.

================== THE CORE PRINCIPLE ==================

GREAT puzzles have ONE core twist that makes people think:
"OH! That makes perfect sense! I should have seen that!"

The key is: REACTION must match CAUSE logically.

================== THE REACTION-CAUSE TEST ==================

Before writing ANY puzzle, ask yourself:

"Would a normal person react THIS WAY to THAT cause?"

❌ BAD: Man screams and runs because his coffee had cream instead of black
   TEST: Would YOU scream and run from cream? NO. Puzzle FAILS.

❌ BAD: Woman thanks neighbor for breaking her expensive vase
   TEST: Would YOU thank someone for breaking your stuff? NO. Puzzle FAILS.

❌ BAD: Man jumps off train because he saw his reflection
   TEST: Would YOU jump off a train from seeing a reflection? NO. Puzzle FAILS.

✅ GOOD: Man thanks bartender who pointed gun at him
   TEST: Would YOU thank someone who scared your hiccups away? YES! Puzzle WORKS.

✅ GOOD: Woman is happy her house burned down
   TEST: Would YOU be happy? Only if you needed insurance money desperately. PUZZLE!

================== GOOD EXAMPLES THAT WORK ==================

1. "Kolya clapped his hands, and everyone else in the room died."
   → He was killing mosquitoes. "Everyone" = mosquitoes.
   WHY IT WORKS: Wordplay. Logical. Real thing people do.

2. "A woman is happy her house burned down. Why?"
   → She was about to lose it to foreclosure. Insurance saved her.
   WHY IT WORKS: Desperate situation makes unusual reaction logical.

3. "A man pushes his car to a hotel and tells the owner he's bankrupt. Why?"
   → He's playing Monopoly. The car is a playing piece.
   WHY IT WORKS: "Car" and "hotel" mean something different than expected.

4. "A doctor gives a patient medicine. The patient dies. The doctor is praised."
   → The patient needed to die (euthanasia/organ donor/pulling plug).
   WHY IT WORKS: "Praised" sounds wrong but death was the goal.

================== CRITICAL RULES ==================

1. REACTION = CAUSE: The reaction MUST make sense given the cause
   - If someone screams, they should be terrified or in pain
   - If someone thanks, they should have received benefit
   - If someone jumps off train, they should be escaping danger

2. NO CONTRADICTIONS: Scenario and solution must agree on all facts
   - "Bought for wife" ≠ "For mistress"  
   - "Sealed window" ≠ "Fell through window"

3. REAL-WORLD PLAUSIBLE: Must be something that could actually happen
   - Normal human psychology
   - Normal physics
   - Normal social situations

4. ACTUAL PUZZLE: Must have a surprising twist worth guessing
   - Not just normal behavior with no twist
   - Not so contrived it feels made-up

================== YOUR TASK ==================

Create an ORIGINAL puzzle. Not a variation of famous ones.

${difficultyPrompt}

${themePrompt}

================== OUTPUT (JSON ONLY) ==================

{
  "scenario": "A surprising situation ending with Why/How/What?",
  "solution": "The logical explanation that makes the reaction make sense",
  "coreTwist": "The assumption flip",
  "factsToDiscover": ["2-3 key facts"]
}`;

  const userPrompt = attemptNumber > 1 
    ? 'Create a DIFFERENT lateral thinking puzzle. The previous one was flawed. Make sure the action in your scenario is LOGICALLY explained by your solution. No contradictions!'
    : 'Create an original lateral thinking puzzle. Make sure the action is logically explained. No contradictions!';

  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7 + (attemptNumber * 0.1), // Increase temperature slightly on retries for variety
  });

  const responseText = completion.choices[0]?.message?.content || '';
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse puzzle response');
  }

  return JSON.parse(jsonMatch[0]);
}

// Helper function to get a random fallback puzzle
function getFallbackPuzzle(difficulty: string, theme: string) {
  const puzzles = FALLBACK_PUZZLES[difficulty as keyof typeof FALLBACK_PUZZLES] || FALLBACK_PUZZLES.medium;
  const randomIndex = Math.floor(Math.random() * puzzles.length);
  const puzzle = puzzles[randomIndex];
  
  return {
    id: `fallback-${Date.now()}`,
    scenario: puzzle.scenario,
    difficulty,
    theme: puzzle.theme,
    _solution: puzzle.solution,
    _coreTwist: 'Classic lateral thinking puzzle',
    _factsToDiscover: ['Think about wordplay and alternative meanings'],
    _isFallback: true
  };
}

export async function POST(request: NextRequest) {
  try {
    const { difficulty, theme } = await request.json();

    const difficultyPrompt = DIFFICULTY_PROMPTS[difficulty] || DIFFICULTY_PROMPTS.medium;
    const themePrompt = THEME_PROMPTS[theme] || THEME_PROMPTS.mystery;

    let zai;
    try {
      zai = await ZAI.create();
    } catch (initError) {
      console.log('SDK init failed, using fallback puzzle:', initError);
      // SDK initialization failed, use fallback
      return NextResponse.json({
        success: true,
        puzzle: getFallbackPuzzle(difficulty, theme)
      });
    }

    const MAX_RETRIES = 3;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`Puzzle generation attempt ${attempt}/${MAX_RETRIES}`);
      
      try {
        // Generate puzzle
        const puzzle = await generatePuzzle(zai, difficultyPrompt, themePrompt, attempt);
        
        if (!puzzle.scenario || !puzzle.solution) {
          console.log('Invalid puzzle format, retrying...');
          continue;
        }

        // Quick validation (no API call)
        const validation = quickValidate(puzzle.scenario, puzzle.solution);
        
        if (validation.valid) {
          console.log('Puzzle validated successfully!');
          return NextResponse.json({
            success: true,
            puzzle: {
              id: Date.now().toString(),
              scenario: puzzle.scenario,
              difficulty,
              theme,
              _solution: puzzle.solution,
              _coreTwist: puzzle.coreTwist,
              _factsToDiscover: puzzle.factsToDiscover,
              _assumptionFlip: puzzle.assumptionFlip,
              _ahaType: puzzle.ahaType
            }
          });
        } else {
          console.log(`Puzzle rejected: ${validation.reason}`);
        }
      } catch (genError) {
        console.error('Generation error:', genError);
        
        // Check for authentication errors - use fallback immediately
        if (genError instanceof Error && 
            (genError.message.includes('401') || 
             genError.message.includes('X-Token') ||
             genError.message.includes('403'))) {
          console.log('AI service authentication failed, using fallback puzzle');
          return NextResponse.json({
            success: true,
            puzzle: getFallbackPuzzle(difficulty, theme)
          });
        }
        
        // If rate limited, wait and retry
        if (genError instanceof Error && genError.message.includes('429')) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // All retries exhausted - use fallback
    console.log('All retries exhausted, using fallback puzzle');
    return NextResponse.json({
      success: true,
      puzzle: getFallbackPuzzle(difficulty, theme)
    });

  } catch (error) {
    console.error('Puzzle generation error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // For any error, try to return a fallback puzzle instead of failing
    if (errorMessage.includes('401') || errorMessage.includes('X-Token') || errorMessage.includes('403')) {
      console.log('Auth error, returning fallback puzzle');
      const { difficulty, theme } = await request.json().catch(() => ({ difficulty: 'medium', theme: 'mystery' }));
      return NextResponse.json({
        success: true,
        puzzle: getFallbackPuzzle(difficulty || 'medium', theme || 'mystery')
      });
    }
    
    if (errorMessage.includes('429')) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }
    
    // Last resort - return fallback
    return NextResponse.json({
      success: true,
      puzzle: getFallbackPuzzle('medium', 'mystery')
    });
  }
}
