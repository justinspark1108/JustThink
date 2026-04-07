import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userSolution, actualSolution, scenario } = await request.json();

    if (!userSolution || !actualSolution || !scenario) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Load z.ai config
    const fs = await import('fs');
    const os = await import('os');
    const homeDir = os.homedir();
    const configPaths = [
      `${process.cwd()}/.z-ai-config`,
      `${homeDir}/.z-ai-config`,
    ];

    let config = null;
    for (const filePath of configPaths) {
      try {
        const configStr = await fs.default.promises.readFile(filePath, 'utf-8');
        config = JSON.parse(configStr);
        break;
      } catch {
        continue;
      }
    }

    if (!config) {
      return NextResponse.json(
        { success: false, error: 'Configuration file not found.' },
        { status: 500 }
      );
    }

    const systemPrompt = `You are evaluating a player's solution to a lateral thinking puzzle.

THE ORIGINAL SCENARIO:
${scenario}

THE CORRECT SOLUTION:
${actualSolution}

THE PLAYER'S SUBMITTED SOLUTION:
${userSolution}

Evaluate how close the player's solution is to the actual solution.

Respond in JSON format only, no markdown fences:
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'glm-4-plus',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Please evaluate my solution.' }
        ],
        temperature: 0.2,
        max_tokens: 300
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const responseDataRaw = await response.text();

    if (!response.ok) {
      console.error('Solution API Error:', response.status, responseDataRaw.substring(0, 200));
      return NextResponse.json(
        { success: false, error: `API Error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const responseJson = JSON.parse(responseDataRaw);
    let responseText = responseJson.choices?.[0]?.message?.content || '';

    // Strip markdown fences
    responseText = responseText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

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
    return NextResponse.json(
      { success: false, error: 'Failed to evaluate solution.' },
      { status: 500 }
    );
  }
}
