import { Sparkles } from 'lucide-react';
import type { AiProvider } from '@leados/shared';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { aiProviderLabels } from '@/lib/labels';

/** "Gemini · gemini-2.5-flash" or the built-in rules explanation. */
export function aiSummary(provider: AiProvider, model: string | null): string {
  if (provider === 'rules') return 'Built-in rules — no AI key set';
  return model ? `${aiProviderLabels[provider]} · ${model}` : aiProviderLabels[provider];
}

export function ProviderCard({ provider, model }: { provider: AiProvider; model: string | null }) {
  const ready = provider !== 'rules';
  return (
    <Card>
      <CardHeader
        title="AI provider"
        description="Set on the server. The same AI scores leads and writes replies."
        actions={
          <Badge tone={ready ? 'success' : 'warning'} dot>
            {ready ? 'Ready' : 'Not set up'}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-3">
        <p className="flex items-center gap-2 type-body text-fg">
          <Sparkles aria-hidden className="size-4 text-fg-subtle" />
          {aiSummary(provider, model)}
        </p>
        {!ready && (
          <Callout tone="warning" title="AI replies are off">
            Add <code className="font-mono">GEMINI_API_KEY</code> or{' '}
            <code className="font-mono">GROQ_API_KEY</code> to <code>.env</code> and restart to turn
            on AI replies. Both have a free tier.
          </Callout>
        )}
      </CardBody>
    </Card>
  );
}
