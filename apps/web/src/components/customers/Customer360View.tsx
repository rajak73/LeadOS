'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Spinner } from '@/components/ui/Spinner';
import { ActivityItemRow } from '@/components/deals/ActivityItem';
import { LeadScoreBadge } from '@/components/leads/LeadScoreBadge';
import Link from 'next/link';

import type { ActivityItem } from '@/lib/types/api';

interface CustomerProfile {
  id: string;
  type: 'LEAD' | 'CONTACT';
  profile: Record<string, unknown>;
  originLead?: Record<string, unknown>;
  engagementScore?: { score: number; confidence: number; recommendation: string };
  timeline: ActivityItem[];
  deals: { id: string; title: string; amount: number }[];
  notes: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  communications: {
    instagram: { id: string; messages: unknown[] }[];
    whatsapp: { id: string; messages: unknown[] }[];
  };
}

export function Customer360View({ customerId }: { customerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['customer-360', customerId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CustomerProfile }>(`/customers/${customerId}`);
      return res.data.data;
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full p-4 lg:p-6 max-w-[1600px] mx-auto">
      {/* Left panel: Identity & Details */}
      <div className="col-span-1 lg:col-span-3 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Link href="/customers" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">← Back to Customers</Link>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-slate-300 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4">
             <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-300 shadow-sm flex items-center justify-center text-xl font-bold text-slate-900">
               {String(data.profile.firstName || '')[0] || '?'}{String(data.profile.lastName || '')[0] || ''}
             </div>
             <div>
                <h1 className="text-xl font-bold text-slate-900">{String(data.profile.firstName)} {String(data.profile.lastName || '')}</h1>
                <span className={`inline-block mt-2 px-2 py-0.5 text-[10px] font-bold tracking-wider rounded border ${data.type === 'CONTACT' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-primary-500/10 text-primary-400 border-primary-500/20'}`}>
                  {data.type}
                </span>
             </div>
          </div>

          <div className="mt-6 space-y-3 text-sm text-slate-600">
            {data.profile.email ? <div className="flex items-center gap-3"><span className="text-slate-500">✉</span> <span>{String(data.profile.email)}</span></div> : null}
            {data.profile.phone ? <div className="flex items-center gap-3"><span className="text-slate-500">☎</span> <span>{String(data.profile.phone)}</span></div> : null}
            {data.profile.company ? <div className="flex items-center gap-3"><span className="text-slate-500">🏢</span> <span>{String(data.profile.company)}</span></div> : null}
            {/* The spec mentions Source, Owner, Tags, Status, but those fields aren't guaranteed in the current profile object without further checking. */}
          </div>
        </div>
      </div>

      {/* Center panel: Timeline Intelligence (Notes, Tasks, Deals, Timeline) */}
      <div className="col-span-1 lg:col-span-6 flex flex-col gap-6">
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Notes */}
          <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-sm ring-1 ring-slate-200 flex flex-col max-h-[300px]">
            <h3 className="text-sm font-semibold mb-4 text-slate-900">Notes ({data.notes.length})</h3>
            <div className="overflow-y-auto pr-2 space-y-3">
              {data.notes.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-100/50 p-4 rounded-xl border border-slate-300 border-dashed text-center">No notes available.</p>
              ) : (
                (data.notes as { id: string; content: string; createdAt: string; createdById?: string }[]).map((note) => (
                  <div key={note.id} className="p-3.5 bg-slate-50 rounded-xl text-sm flex flex-col gap-2 ring-1 ring-slate-300 shadow-sm">
                    <p className="text-slate-900 whitespace-pre-wrap">{note.content}</p>
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 pt-2 border-t border-slate-300">
                      <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                      <span>{note.createdById?.slice(0, 8) || 'System'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Tasks */}
          <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-sm ring-1 ring-slate-200 flex flex-col max-h-[300px]">
            <h3 className="text-sm font-semibold mb-4 text-slate-900">Tasks ({data.tasks.length})</h3>
            <div className="overflow-y-auto pr-2 space-y-3">
              {data.tasks.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-100/50 p-4 rounded-xl border border-slate-300 border-dashed text-center">No open tasks.</p>
              ) : (
                (data.tasks as { id: string; title: string; status: string; dueDate?: string; assignedToId?: string }[]).map((task) => (
                  <div key={task.id} className="p-3.5 bg-slate-50 rounded-xl text-sm flex flex-col gap-2 ring-1 ring-slate-300 shadow-sm">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium text-slate-900 leading-tight">{task.title}</span>
                      <span className={`shrink-0 px-2 py-0.5 text-[10px] font-bold tracking-wider rounded border ${task.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                        {task.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 pt-2 border-t border-slate-300">
                      <span>{task.dueDate ? `Due: ${new Date(task.dueDate).toLocaleDateString()}` : 'No due date'}</span>
                      <span>{task.assignedToId ? 'Assigned' : 'Unassigned'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Deals */}
        {data.deals.length > 0 && (
          <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-sm font-semibold mb-4 text-slate-900">Pipeline Deals ({data.deals.length})</h3>
            <div className="space-y-3">
              {data.deals.map((deal) => (
                <div key={deal.id} className="p-3.5 bg-slate-50 rounded-xl text-sm flex justify-between items-center ring-1 ring-slate-300 shadow-sm">
                  <span className="font-medium text-slate-900 truncate mr-4">{deal.title}</span>
                  <span className="font-mono text-xs font-semibold text-primary-400 bg-primary-500/10 px-2 py-1 rounded-md border border-primary-500/20">${deal.amount}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Communications Summary */}
        {(data.communications.instagram.length > 0 || data.communications.whatsapp.length > 0) && (
          <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-sm ring-1 ring-slate-200 flex gap-4">
            {data.communications.instagram.map((ig) => (
              <div key={ig.id} className="text-sm bg-slate-50 px-3 py-2 rounded-lg ring-1 ring-slate-300">
                <span className="font-semibold text-pink-400">IG Direct</span> <span className="text-slate-500 ml-2">{ig.messages.length} msgs</span>
              </div>
            ))}
            {data.communications.whatsapp.map((wa) => (
              <div key={wa.id} className="text-sm bg-slate-50 px-3 py-2 rounded-lg ring-1 ring-slate-300">
                <span className="font-semibold text-green-400">WhatsApp</span> <span className="text-slate-500 ml-2">{wa.messages.length} msgs</span>
              </div>
            ))}
          </div>
        )}

        {/* Unified Timeline */}
        <div className="bg-white p-6 rounded-2xl border border-slate-300 shadow-sm ring-1 ring-slate-200 flex-1 min-h-[500px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-slate-900">Activity Timeline</h3>
            <span className="text-xs text-slate-500">{data.timeline.length} events</span>
          </div>
          
          {data.timeline.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500 bg-slate-100/30 rounded-xl border border-slate-300 border-dashed">
              No activity recorded for this customer yet.
            </div>
          ) : (
            <div className="space-y-2">
              {data.timeline.map((item) => (
                <ActivityItemRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: AI & Revenue Insights */}
      <div className="col-span-1 lg:col-span-3 flex flex-col gap-6">
        
        {/* Engagement Score (AI Insights) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-300 shadow-sm ring-1 ring-ai-start/30 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-ai-start/10 to-ai-end/10 pointer-events-none group-hover:from-ai-start/15 transition-colors" />
          <div className="relative z-10">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-slate-900">
              <span className="text-ai-start">✨</span> AI Insights
            </h3>
            {data.engagementScore ? (
              <div className="flex flex-col gap-4">
                <div className="inline-flex">
                  <LeadScoreBadge score={data.engagementScore.score} />
                </div>
                <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-300 backdrop-blur-sm">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {data.engagementScore.recommendation || 'AI recommendation is pending evaluation.'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 bg-slate-50/50 p-4 rounded-xl border border-slate-300 border-dashed text-center">
                Insufficient data to generate AI insights.
              </p>
            )}
          </div>
        </div>
        
        {/* Extended AI Revenue placeholders */}
        <div className="bg-white p-6 rounded-2xl border border-slate-300 shadow-sm ring-1 ring-slate-200 space-y-4">
           <h3 className="text-sm font-semibold text-slate-900">Revenue Intelligence</h3>
           
           <div>
             <span className="text-xs text-slate-500 block mb-1">Buying Intent</span>
             <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded-lg ring-1 ring-slate-300">Analyzing signals...</div>
           </div>
           
           <div>
             <span className="text-xs text-slate-500 block mb-1">Predicted Revenue</span>
             <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded-lg ring-1 ring-slate-300">Pending historic data</div>
           </div>
           
           <div>
             <span className="text-xs text-slate-500 block mb-1">Customer Health</span>
             <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded-lg ring-1 ring-slate-300">Establishing baseline</div>
           </div>
        </div>

      </div>
    </div>
  );
}
