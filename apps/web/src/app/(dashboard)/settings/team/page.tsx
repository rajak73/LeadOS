'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Spinner } from '@/components/ui/Spinner';

interface RoleMember {
  id: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
  role: {
    id: string;
    name: string;
  };
  status: string;
  joinedAt: string | null;
}

interface TeamResponse {
  data: RoleMember[];
}

function useTeamMembers() {
  return useQuery<RoleMember[]>({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res = await apiClient.get<TeamResponse>('/team');
      return res.data.data;
    },
    retry: false,
  });
}

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  ADMIN: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  MANAGER: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  SALES_EXECUTIVE: 'bg-green-500/15 text-green-400 border-green-500/20',
};

export default function TeamPage() {
  const { data: members, isLoading, error } = useTeamMembers();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Team & Roles</h2>
        <p className="text-sm text-text-tertiary mt-0.5">
          View team members and their assigned roles. Role management is available to admins.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-bg-elevated overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        )}

        {error && (
          <div className="py-16 text-center">
            <p className="text-text-tertiary text-sm">Could not load team members.</p>
          </div>
        )}

        {members && members.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-3xl mb-3">👥</p>
            <p className="text-text-tertiary text-sm">No team members yet.</p>
          </div>
        )}

        {members && members.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-base">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Member
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Role
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-border/50 last:border-0 hover:bg-bg-subtle/30 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div>
                      <p className="font-medium text-text-primary">
                        {m.user.firstName} {m.user.lastName}
                      </p>
                      <p className="text-xs text-text-tertiary">{m.user.email}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border
                        ${ROLE_COLORS[m.role.name] ?? 'bg-bg-subtle text-text-secondary border-border'}`}
                    >
                      {m.role.name.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs
                        ${m.status === 'ACTIVE' ? 'text-green-400' : 'text-text-tertiary'}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${m.status === 'ACTIVE' ? 'bg-green-400' : 'bg-text-tertiary'}`}
                      />
                      {m.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-text-tertiary text-xs">
                    {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
