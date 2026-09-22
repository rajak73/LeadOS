import { Bot, Check, Flame, Sparkles, UserPlus } from 'lucide-react';

/**
 * Illustration of an Instagram DM being answered by the AI. Purely decorative content,
 * so it is described once for screen readers and the inner details are hidden.
 */
export function ChatPreview() {
  return (
    <figure className="relative mx-auto w-full max-w-md">
      <figcaption className="sr-only">
        Example: a customer asks in Hinglish whether a kurti set is available in her size, and
        LeadOS replies in Hinglish, creates a lead and scores it as hot.
      </figcaption>
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-accent-subtle blur-2xl"
      />
      <div
        aria-hidden
        className="overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-chart-5/15 type-small font-semibold text-fg">
            PS
          </span>
          <div className="min-w-0 flex-1">
            <p className="type-body font-medium text-fg">Priya Sharma</p>
            <p className="type-caption text-fg-subtle">@priya.styles · Instagram</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-success-subtle px-2 py-0.5 type-caption font-medium text-success-fg">
            <Bot className="size-3.5" /> Auto-reply on
          </span>
        </div>

        <div className="space-y-3 bg-background/60 px-4 py-5">
          <Bubble side="left">Hi! Ye maroon kurti set M size mein hai? Price kya hai?</Bubble>
          <Bubble side="right" label="AI assistant · 12 seconds later">
            Hi Priya! Haan, maroon kurti set M size mein available hai — ₹1,299, free delivery ke
            saath. COD bhi hai. Order ke liye apna naam aur phone number bhej dijiye?
          </Bubble>
          <Bubble side="left">Priya Sharma, 98XXXXXX21. COD pe bhej do 👍</Bubble>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <Chip icon={<UserPlus className="size-3.5" />}>Lead created</Chip>
          <Chip icon={<Flame className="size-3.5" />} tone="warning">
            AI score 88 · Hot
          </Chip>
          <Chip icon={<Check className="size-3.5" />} tone="success">
            Task: confirm order
          </Chip>
        </div>
      </div>

      <div
        aria-hidden
        className="absolute -bottom-6 -left-4 hidden items-center gap-2 rounded-xl border border-border bg-surface-raised px-3 py-2 shadow-md sm:flex"
      >
        <Sparkles className="size-4 text-primary-text" />
        <span className="type-small text-fg">Answered from your business info</span>
      </div>
    </figure>
  );
}

function Bubble({
  side,
  label,
  children,
}: {
  side: 'left' | 'right';
  label?: string;
  children: React.ReactNode;
}) {
  const mine = side === 'right';
  return (
    <div className={mine ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
      <p
        className={
          mine
            ? 'max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 type-body text-primary-fg'
            : 'max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface px-3.5 py-2.5 type-body text-fg'
        }
      >
        {children}
      </p>
      {label && <span className="mt-1 type-caption text-fg-subtle">{label}</span>}
    </div>
  );
}

function Chip({
  icon,
  tone = 'primary',
  children,
}: {
  icon: React.ReactNode;
  tone?: 'primary' | 'success' | 'warning';
  children: React.ReactNode;
}) {
  const tones = {
    primary: 'bg-primary-subtle text-primary-subtle-fg',
    success: 'bg-success-subtle text-success-fg',
    warning: 'bg-warning-subtle text-warning-fg',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 type-caption font-medium ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}
