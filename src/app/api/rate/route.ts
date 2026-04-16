import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { puzzleId, scenario, theme, rating, feedback } = await request.json();

    if (!puzzleId || !scenario || !theme || !rating) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: puzzleId, scenario, theme, rating' },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: 'Rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    const puzzleRating = await prisma.puzzleRating.create({
      data: {
        puzzleId,
        scenario,
        theme,
        rating,
        feedback: feedback || null,
      },
    });

    return NextResponse.json({
      success: true,
      rating: puzzleRating,
    });

  } catch (error) {
    console.error('Rating submission error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit rating.' },
      { status: 500 }
    );
  }
}
