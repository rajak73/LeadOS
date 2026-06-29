'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { useInviteMember, useUpdateRole, useRemoveMember } from '@/lib/hooks/useTeam';

interface RoleMember {
  id: string;
  user: {
    id: string;
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
  SUPPORT: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES_EXECUTIVE: 'Sales',
  SUPPORT: 'Support',
};

const AVAILABLE_ROLES = ['ADMIN', 'MANAGER', 'SALES_EXECUTIVE', 'SUPPORT'];

export default function TeamPage() {
  const { data: members, isLoading, error } = useTeamMembers();
  const inviteMember = useInviteMember();
  const updateRole = useUpdateRole();
  const removeMember = useRemoveMember();

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('SALES_EXECUTIVE');
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await inviteMember.mutateAsync({ email: inviteEmail, role: inviteRole });
      if (res?.invitationUrl) {
        setInvitationUrl(res.invitationUrl);
      } else {
        alert('Invitation sent successfully!');
        setShowInviteModal(false);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to send invite');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Team & Roles</h2>
          <p className="text-sm text-text-tertiary mt-0.5">
            View team members and their assigned roles. Role management is available to admins.
          </p>
        </div>
        <Button onClick={() => { setShowInviteModal(true); setInvitationUrl(null); }}>Invite Member</Button>
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
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Member</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Role</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Joined</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-border/50 last:border-0 hover:bg-bg-subtle/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <div>
                      <p className="font-medium text-text-primary">
                        {m.user.firstName} {m.user.lastName}
                      </p>
                      <p className="text-xs text-text-tertiary">{m.user.email}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <select
                      value={m.role.name}
                      onChange={async (e) => {
                        try {
                          await updateRole.mutateAsync({ userId: m.user.id, roleName: e.target.value });
                        } catch (err: unknown) {
                          alert(err instanceof Error ? err.message : 'Failed to update role');
                        }
                      }}
                      disabled={m.role.name === 'OWNER' || updateRole.isPending}
                      className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border focus:outline-none focus:ring-2 focus:ring-primary-500
                        ${ROLE_COLORS[m.role.name] ?? 'bg-bg-subtle text-text-secondary border-border'} bg-transparent appearance-none cursor-pointer`}
                    >
                      {m.role.name === 'OWNER' && <option value="OWNER">Owner</option>}
                      {AVAILABLE_ROLES.map(r => (
                        <option key={r} value={r} className="bg-bg-elevated text-text-primary">{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${m.status === 'ACTIVE' ? 'text-green-400' : 'text-text-tertiary'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'ACTIVE' ? 'bg-green-400' : 'bg-text-tertiary'}`} />
                      {m.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-text-tertiary text-xs">
                    {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {m.role.name !== 'OWNER' && (
                      <button 
                        onClick={async () => {
                          if (confirm('Are you sure you want to remove this member?')) {
                            try {
                              await removeMember.mutateAsync(m.user.id);
                            } catch (err: unknown) {
                              alert(err instanceof Error ? err.message : 'Failed to remove member');
                            }
                          }
                        }}
                        disabled={removeMember.isPending}
                        className="text-red-500 hover:text-red-400 text-xs font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-bg-elevated border border-border p-6 rounded-2xl w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-4">Invite Team Member</h3>
            
            {invitationUrl ? (
              <div className="space-y-4">
                <p className="text-sm text-text-secondary">Invitation created! Share this link with the user:</p>
                <div className="p-3 bg-bg-base border border-border rounded-lg break-all text-xs font-mono text-primary-400">
                  {invitationUrl}
                </div>
                <div className="pt-4 flex justify-end">
                  <Button onClick={() => setShowInviteModal(false)}>Close</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Email Address</label>
                  <input 
                    type="email" 
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    className="w-full border border-border bg-bg-base rounded-md p-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value)}
                    className="w-full border border-border bg-bg-base rounded-md p-2 text-white"
                  >
                    {AVAILABLE_ROLES.map(r => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="secondary" onClick={() => setShowInviteModal(false)} type="button">Cancel</Button>
                  <Button type="submit" disabled={inviteMember.isPending}>
                    {inviteMember.isPending ? 'Inviting...' : 'Send Invite'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
