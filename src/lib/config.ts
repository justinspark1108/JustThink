// Shared AI config loader
// Priority: environment variables > .z-ai-config file

interface AIConfig {
  baseUrl: string;
  apiKey: string;
}

export async function getAIConfig(): Promise<AIConfig | null> {
  // 1. Try environment variables first (for Vercel/deployment)
  if (process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY) {
    return {
      baseUrl: process.env.ZAI_BASE_URL,
      apiKey: process.env.ZAI_API_KEY,
    };
  }

  // 2. Fall back to .z-ai-config file (for local dev)
  const fs = await import('fs');
  const os = await import('os');
  const homeDir = os.homedir();
  const configPaths = [
    `${process.cwd()}/.z-ai-config`,
    `${homeDir}/.z-ai-config`,
  ];

  for (const filePath of configPaths) {
    try {
      const configStr = await fs.default.promises.readFile(filePath, 'utf-8');
      return JSON.parse(configStr);
    } catch {
      continue;
    }
  }

  return null;
}

export const AI_MODEL = process.env.ZAI_MODEL || 'glm-4-plus';
