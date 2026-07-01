'use client';

export function WindowExpiredBanner() {
  return (
    <div className="flex items-start gap-3 p-3 border-t border-slate-200 bg-yellow-500/15 border-yellow-500/20">
      <span className="text-xs text-yellow-400 shrink-0">⚠ 24-hour messaging window closed</span>
      <p className="text-xs text-slate-600">
        The customer must send a new message to reopen the conversation.
      </p>
    </div>
  );
}
