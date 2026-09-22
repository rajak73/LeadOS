import OpenAI from 'openai';
import type { AiProvider } from '@leados/shared';
import type { ZodType, ZodTypeDef } from 'zod';
import { env, type Env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

/**
 * One AI provider serves lead scoring and Instagram replies. Gemini, Groq and OpenAI all
 * expose OpenAI-compatible chat endpoints, so everything goes through the `openai` SDK with
 * a provider-specific base URL. No request is ever made unless that provider's key is set.
 */

export const AI_TIMEOUT_MS = 20_000;

type LlmProvider = Exclude<AiProvider, 'rules'>;

export const PROVIDERS: Record<
  LlmProvider,
  { baseURL: string | undefined; defaultModel: string; keyVar: keyof Env; label: string }
> = {
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.5-flash',
    keyVar: 'GEMINI_API_KEY',
    label: 'Gemini',
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    keyVar: 'GROQ_API_KEY',
    label: 'Groq',
  },
  openai: {
    baseURL: undefined, // SDK default (api.openai.com)
    defaultModel: 'gpt-4o-mini',
    keyVar: 'OPENAI_API_KEY',
    label: 'OpenAI',
  },
};

export type ProviderConfig =
  | { provider: 'rules'; model: null; apiKey: null; baseURL: undefined }
  | { provider: LlmProvider; model: string; apiKey: string; baseURL: string | undefined };

const RULES: ProviderConfig = { provider: 'rules', model: null, apiKey: null, baseURL: undefined };

type ProviderEnv = Pick<
  Env,
  'AI_PROVIDER' | 'AI_MODEL' | 'GEMINI_API_KEY' | 'GROQ_API_KEY' | 'OPENAI_API_KEY' | 'OPENAI_MODEL'
>;

/**
 * AI_PROVIDER wins when set (and then only that provider's key counts — we never silently send
 * data to a different provider). Otherwise the first configured key of Gemini, Groq, OpenAI.
 * Read on every call so key changes (and tests) take effect without a restart.
 */
export function resolveProvider(e: ProviderEnv = env): ProviderConfig {
  const keyOf = (p: LlmProvider) =>
    e[PROVIDERS[p].keyVar as keyof ProviderEnv] as string | undefined;
  const provider: LlmProvider | undefined = e.AI_PROVIDER
    ? keyOf(e.AI_PROVIDER)
      ? e.AI_PROVIDER
      : undefined
    : (['gemini', 'groq', 'openai'] as const).find((p) => keyOf(p));
  if (!provider) return RULES;
  const model =
    e.AI_MODEL ??
    (provider === 'openai' ? e.OPENAI_MODEL : undefined) ??
    PROVIDERS[provider].defaultModel;
  return { provider, model, apiKey: keyOf(provider)!, baseURL: PROVIDERS[provider].baseURL };
}

export const currentProvider = (): { provider: AiProvider; model: string | null } => {
  const { provider, model } = resolveProvider();
  return { provider, model };
};

/** Logged once at startup so a misconfigured AI_PROVIDER is easy to spot. */
export function describeProvider(): string {
  const cfg = resolveProvider();
  if (cfg.provider !== 'rules')
    return `AI provider: ${PROVIDERS[cfg.provider].label} (${cfg.model})`;
  if (env.AI_PROVIDER)
    return `AI_PROVIDER=${env.AI_PROVIDER} but ${PROVIDERS[env.AI_PROVIDER].keyVar} is not set — AI replies are off and scoring uses the built-in rules`;
  return 'No AI key set — lead scoring uses the built-in rules and AI replies are off';
}

/** Thrown when no provider is configured or the provider call failed. Message is user-safe. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly reason: 'not_configured' | 'request_failed' | 'invalid_response',
  ) {
    super(message);
    this.name = 'AiError';
  }
}

/**
 * What the provider actually said, so the person reading it can fix it: a wrong key, a model
 * that no longer exists and a spent quota all look the same otherwise. Keys are never echoed
 * back by these APIs, so the message is safe to show.
 */
export function providerReason(err: unknown): string {
  const e = err as { status?: number; message?: string; error?: { message?: string } };
  const detail = (e?.error?.message ?? e?.message ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const status = typeof e?.status === 'number' ? e.status : null;
  if (status === 401 || status === 403)
    return `rejected the API key: ${detail || 'not authorised'}`;
  if (status === 404) return `doesn't know this model: ${detail || 'model not found'}`;
  if (status === 429) return `is rate limited or out of quota: ${detail || 'too many requests'}`;
  if (status && status >= 500) return `had a server error (${status}). Try again in a moment.`;
  if (status === 400) return `refused the request: ${detail || 'bad request'}`;
  return detail ? `didn't respond: ${detail}` : "didn't respond. Try again in a moment.";
}

const isModelError = (err: unknown) => (err as { status?: number } | null)?.status === 404;

/**
 * Providers retire models, and then every reply fails until AI_MODEL is changed. Ask which ones
 * this key may use, so the message says what to put there instead of just what broke.
 */
async function availableModelsHint(client: OpenAI): Promise<string> {
  try {
    const list = await client.models.list({ timeout: 5_000 });
    const ids = list.data
      .map((m) => m.id)
      .filter(Boolean)
      .sort()
      .slice(0, 8);
    return ids.length ? ` Models you can use: ${ids.join(', ')} — set one as AI_MODEL.` : '';
  } catch {
    return ''; // the listing is a nicety; never turn it into a second failure
  }
}

let cached: { key: string; client: OpenAI } | null = null;
function clientFor(cfg: Extract<ProviderConfig, { apiKey: string }>): OpenAI {
  const key = `${cfg.provider}|${cfg.baseURL ?? ''}|${cfg.apiKey}`;
  if (cached?.key !== key) {
    cached = {
      key,
      client: new OpenAI({
        apiKey: cfg.apiKey,
        ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
        timeout: AI_TIMEOUT_MS,
        maxRetries: 0,
      }),
    };
  }
  return cached.client;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatJsonResult<T> {
  data: T;
  provider: LlmProvider;
  model: string;
}

/** Some models wrap JSON in ``` fences even in JSON mode. */
function extractJson(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(trimmed);
}

/**
 * Sends a chat request in JSON mode and validates the answer with `schema`. Invalid JSON (or
 * JSON that doesn't match) is retried once; network/API errors are not retried. Throws AiError.
 */
export async function chatJson<T>(
  messages: ChatMessage[],
  schema: ZodType<T, ZodTypeDef, unknown>,
  options: { temperature?: number } = {},
): Promise<ChatJsonResult<T>> {
  const cfg = resolveProvider();
  if (cfg.provider === 'rules')
    throw new AiError('Add a Gemini, Groq or OpenAI API key to use AI.', 'not_configured');
  const client = clientFor(cfg);

  for (let attempt = 1; attempt <= 2; attempt++) {
    let content: string | null | undefined;
    try {
      const completion = await client.chat.completions.create(
        {
          model: cfg.model,
          temperature: options.temperature ?? 0.3,
          messages,
          response_format: { type: 'json_object' },
        },
        { timeout: AI_TIMEOUT_MS },
      );
      content = completion?.choices?.[0]?.message?.content;
    } catch (err) {
      logger.warn({ err, provider: cfg.provider, model: cfg.model }, 'AI request failed');
      const hint = isModelError(err) ? await availableModelsHint(client) : '';
      throw new AiError(
        `${PROVIDERS[cfg.provider].label} (${cfg.model}) ${providerReason(err)}${hint}`,
        'request_failed',
      );
    }
    try {
      if (!content) throw new Error('empty response');
      const parsed = schema.safeParse(extractJson(content));
      if (parsed.success) return { data: parsed.data, provider: cfg.provider, model: cfg.model };
      throw parsed.error;
    } catch (err) {
      logger.warn(
        { err, provider: cfg.provider, model: cfg.model, attempt },
        'AI returned invalid JSON',
      );
    }
  }
  throw new AiError(
    `${PROVIDERS[cfg.provider].label} gave an answer we couldn't read. Try again.`,
    'invalid_response',
  );
}
