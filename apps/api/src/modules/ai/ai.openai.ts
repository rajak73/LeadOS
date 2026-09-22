import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { SCORE_JSON_SCHEMA, SYSTEM_PROMPT, buildScoringPrompt } from './ai.prompt.js';
import { type LeadContext, type ScoreResult, clampScore } from './ai.types.js';

export const OPENAI_TIMEOUT_MS = 15_000;

const responseSchema = z.object({
  score: z.number(),
  factors: z
    .array(
      z.object({
        type: z.enum(['POSITIVE', 'NEGATIVE']),
        description: z.string().trim().min(1).max(300),
      }),
    )
    .max(10),
  recommendation: z.string().trim().min(1).max(500),
});

let client: { key: string; instance: OpenAI } | null = null;
function getClient(apiKey: string): OpenAI {
  if (client?.key !== apiKey)
    client = {
      key: apiKey,
      instance: new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS, maxRetries: 0 }),
    };
  return client.instance;
}

/** Scores with OpenAI structured output. Throws on any failure so the caller can fall back to rules. */
export async function scoreWithOpenAI(ctx: LeadContext): Promise<ScoreResult> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set'); // never send data without a key
  const model = env.OPENAI_MODEL;
  const completion = await getClient(apiKey).chat.completions.create(
    {
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildScoringPrompt(ctx) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'lead_score',
          strict: true,
          schema: SCORE_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    },
    { timeout: OPENAI_TIMEOUT_MS },
  );
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty response');
  const parsed = responseSchema.parse(JSON.parse(content));
  return {
    score: clampScore(parsed.score),
    factors: parsed.factors,
    recommendation: parsed.recommendation,
    modelVersion: model,
  };
}
