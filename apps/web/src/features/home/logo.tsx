import { Link } from 'react-router';

export function HomeLogo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-md" aria-label="LeadOS home">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg bg-primary type-body font-bold text-primary-fg"
      >
        L
      </span>
      <span className="type-section text-fg">LeadOS</span>
    </Link>
  );
}
