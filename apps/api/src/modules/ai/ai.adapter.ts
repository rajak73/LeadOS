import { GoogleGenAI } from '@google/genai';
import { env } from '../../core/config/env.js';
import { logger } from '../../core/observability/logger.js';
import type { LeadContext, ScoreResult } from '@leados/shared';
import { compileScoringPrompt } from './ai.prompts.js';

export interface AiAdapter {
  scoreLead(context: LeadContext): Promise<ScoreResult>;
  draftFollowup(context: LeadContext): Promise<{ channel: 'EMAIL' | 'INSTAGRAM_DM'; draft: string }>;
}

export class MockAiAdapter implements AiAdapter {
  async scoreLead(context: LeadContext): Promise<ScoreResult> {
    const email = context.lead.email;
    const hasEmail = !!email;
    const isInstagram = context.lead.source === 'INSTAGRAM_DM';

    let score = 50;
    const factors: Array<{ type: 'POSITIVE' | 'NEGATIVE'; description: string }> = [];

    if (hasEmail) {
      score += 20;
      factors.push({ type: 'POSITIVE', description: 'Has email address (+20)' });
    } else {
      score -= 10;
      factors.push({ type: 'NEGATIVE', description: 'No email address provided (-10)' });
    }

    if (isInstagram) {
      score += 15;
      factors.push({ type: 'POSITIVE', description: 'Connected via Instagram DM (+15)' });
    }

    score = Math.max(0, Math.min(100, score));

    return {
      score,
      factors,
      recommendation: score >= 70 ? 'Follow up within 4 hours' : 'Follow up within 24 hours',
      modelVersion: 'mock-model-v1',
    };
  }

  async draftFollowup(context: LeadContext): Promise<{ channel: 'EMAIL' | 'INSTAGRAM_DM'; draft: string }> {
    const channel = context.lead.source === 'INSTAGRAM_DM' ? 'INSTAGRAM_DM' : 'EMAIL';
    const name = context.lead.firstName;
    let draft = '';
    if (channel === 'INSTAGRAM_DM') {
      draft = `Hi ${name}! Just following up to see if you had any other questions about LeadOS. We would love to help you get started. Let me know what you think!`;
    } else {
      draft = `Subject: Quick follow up from LeadOS\n\nHi ${name},\n\nI wanted to follow up on our previous conversation to see if you had any questions or if you'd like to schedule a quick demo. We're excited to help you streamline your sales pipelines.\n\nBest regards,\nThe Team`;
    }
    return { channel, draft };
  }
}

export class OpenAiAdapter implements AiAdapter {
  constructor(_apiKey?: string) {}

  async scoreLead(_context: LeadContext): Promise<ScoreResult> {
    compileScoringPrompt(_context); 
    throw new Error('OpenAiAdapter.scoreLead is not implemented yet.');
  }

  async draftFollowup(_context: LeadContext): Promise<{ channel: 'EMAIL' | 'INSTAGRAM_DM'; draft: string }> {
    throw new Error('OpenAiAdapter.draftFollowup is not implemented yet.');
  }
}

export class GeminiAdapter implements AiAdapter {
  constructor(private readonly apiKey: string) {}

  async scoreLead(context: LeadContext): Promise<ScoreResult> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const prompt = compileScoringPrompt(context);

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              score: { type: 'INTEGER' },
              confidence: { type: 'NUMBER' },
              positiveFactors: { type: 'ARRAY', items: { type: 'STRING' } },
              negativeFactors: { type: 'ARRAY', items: { type: 'STRING' } },
              recommendation: { type: 'STRING' }
            },
            required: ['score', 'positiveFactors', 'negativeFactors', 'recommendation']
          }
        }
      });

      if (!response.text) {
         throw new Error("Empty response from Gemini");
      }

      const parsed = JSON.parse(response.text);
      const factors: Array<{ type: 'POSITIVE' | 'NEGATIVE'; description: string }> = [];
      
      if (Array.isArray(parsed.positiveFactors)) {
        parsed.positiveFactors.forEach((f: string) => factors.push({ type: 'POSITIVE', description: f }));
      }
      if (Array.isArray(parsed.negativeFactors)) {
        parsed.negativeFactors.forEach((f: string) => factors.push({ type: 'NEGATIVE', description: f }));
      }

      return {
        score: parsed.score,
        factors,
        recommendation: parsed.recommendation,
        modelVersion: 'gemini-2.5-flash',
      };
    } catch (err) {
      logger.error({ message: 'Gemini scoreLead failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  async draftFollowup(_context: LeadContext): Promise<{ channel: 'EMAIL' | 'INSTAGRAM_DM'; draft: string }> {
    throw new Error('GeminiAdapter.draftFollowup is not implemented yet.');
  }
}

export function getAiAdapter(): AiAdapter {
  if (process.env.GEMINI_API_KEY) {
    return new GeminiAdapter(process.env.GEMINI_API_KEY);
  }
  if (env.OPENAI_API_KEY && env.NODE_ENV !== 'test') {
    return new OpenAiAdapter(env.OPENAI_API_KEY);
  }
  return new MockAiAdapter();
}
