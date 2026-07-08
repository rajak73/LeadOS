'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

interface Session {
  id: string;
  deviceInfo: string;
  ipAddress: string;
  createdAt: string;
  isCurrent?: boolean;
}

// Placeholder sessions — in production these would come from a /me/sessions endpoint
const MOCK_SESSIONS: Session[] = [
  {
    id: 'current',
    deviceInfo: 'Chrome on macOS',
    ipAddress: '127.0.0.1',
    createdAt: new Date().toISOString(),
    isCurrent: true,
  },
];

function ProfileForm() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Wire to PATCH /me endpoint when available
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-slate-600 mb-1.5">
            First Name
          </label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Jane"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50
                       text-slate-900 placeholder:text-slate-500
                       focus:outline-none focus:border-primary-500 transition-colors"
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-slate-600 mb-1.5">
            Last Name
          </label>
          <input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Doe"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50
                       text-slate-900 placeholder:text-slate-500
                       focus:outline-none focus:border-primary-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="sm">
          Save Changes
        </Button>
        {saved && <span className="text-sm text-green-400 animate-in fade-in">✓ Saved</span>}
      </div>
    </form>
  );
}

function SessionsPanel({ sessions }: { sessions: Session[] }) {
  const router = useRouter();

  const handleRevoke = async (sessionId: string) => {
    // TODO: Call DELETE /me/sessions/:id when endpoint is available
    console.info('Revoke session', sessionId);
    if (sessions.find((s) => s.id === sessionId)?.isCurrent) {
      router.push('/login');
    }
  };

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <div
          key={session.id}
          className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50"
        >
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-900">{session.deviceInfo}</span>
              {session.isCurrent && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                  Current
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {session.ipAddress} · {new Date(session.createdAt).toLocaleString()}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRevoke(session.id)}
            className="text-danger-400 hover:bg-danger-500/10"
          >
            {session.isCurrent ? 'Sign Out' : 'Revoke'}
          </Button>
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="space-y-10">
      {/* Profile info */}
      <section>
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
          <p className="text-sm text-slate-500">Update your personal details</p>
        </div>
        <div className="p-6 rounded-2xl border border-slate-200 bg-white">
          <ProfileForm />
        </div>
      </section>

      {/* Active sessions */}
      <section>
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">Active Sessions</h2>
          <p className="text-sm text-slate-500">
            Manage where you are signed in. Revoking a session immediately invalidates the
            refresh token.
          </p>
        </div>
        <SessionsPanel sessions={MOCK_SESSIONS} />
      </section>
    </div>
  );
}
