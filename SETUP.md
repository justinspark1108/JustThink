# Just Think - Lateral Thinking Puzzles

An AI-powered lateral thinking puzzle game where players ask yes/no questions to solve mysteries.

## Features

- AI-generated puzzles across multiple difficulty levels (Easy, Medium, Hard)
- Various themes: Mystery, Logic, Survival, Horror, Crime
- Voice input support for asking questions
- Solution evaluation with accuracy scoring
- Dark/light theme support

## Tech Stack

- Next.js 16 with App Router
- TypeScript
- Tailwind CSS
- shadcn/ui components
- Z.ai SDK for AI capabilities

## Setup for Development

### Prerequisites

- Node.js 20+ or Bun
- Z.ai API credentials

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd just-think
```

2. Install dependencies:
```bash
bun install
```

3. Create your API config file:
```bash
cp .z-ai-config.example .z-ai-config
```

4. Edit `.z-ai-config` with your Z.ai credentials:
```json
{
  "baseUrl": "YOUR_API_BASE_URL",
  "apiKey": "YOUR_API_KEY",
  "token": "YOUR_X_TOKEN",
  "userId": "YOUR_USER_ID",
  "chatId": "YOUR_CHAT_ID"
}
```

5. Run the development server:
```bash
bun run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── app/
│   ├── page.tsx          # Main game UI
│   ├── layout.tsx        # Root layout with theming
│   └── api/
│       ├── generate/     # Puzzle generation endpoint
│       ├── question/     # Yes/no question answering
│       └── solution/     # Solution evaluation
├── components/
│   └── ui/               # shadcn/ui components
└── lib/
    └── utils.ts          # Utility functions
```

## API Rate Limits

The Z.ai API has the following rate limits:
- 2 requests per second (QPS)
- 10 requests per 10 minutes per IP
- 300 requests per day

For production use, consider requesting higher limits from Z.ai.

## Puzzle Quality Rules

The puzzle generation follows these rules to ensure quality:

1. **No direct contradictions** - Scenario must be technically true
2. **No lying as objective fact** - Narrator cannot state falsehoods
3. **Logical reactions** - Reactions must fit the cause
4. **Fair play** - Solution must be discoverable through questions
5. **Original puzzles** - No famous puzzle variations
6. **Realistic behavior** - Actions must be things people actually do

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Connect Vercel to your repo
3. Set environment variables (create from .z-ai-config)
4. Deploy

### Self-hosted

1. Build: `bun run build`
2. Start: `bun run start`

## Notes for AI Agents

When working on this project:
- The `.z-ai-config` file contains sensitive API credentials - never commit it
- Use the `.z-ai-config.example` as a template
- The API has rate limits - test sparingly
- Puzzle quality is critical - follow the 6 rules above
