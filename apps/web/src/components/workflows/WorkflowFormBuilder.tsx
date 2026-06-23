'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import type { Workflow } from '@/lib/hooks/useWorkflows';
import type { WorkflowDefinition, WorkflowCondition } from '@leados/shared';

interface WorkflowFormBuilderProps {
  initialData?: Workflow;
  onSave: (data: {
    name: string;
    description: string;
    triggerType: string;
    isActive: boolean;
    definition: WorkflowDefinition;
  }) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

const TRIGGER_OPTIONS = [
  { value: 'LEAD_CREATED', label: 'Lead Created' },
  { value: 'LEAD_STATUS_CHANGED', label: 'Lead Status Changed' },
  { value: 'DEAL_CREATED', label: 'Deal Created' },
  { value: 'DEAL_STAGE_MOVED', label: 'Deal Stage Moved' },
  { value: 'MESSAGE_RECEIVED', label: 'Message Received' },
];

const FIELD_OPTIONS = [
  { value: 'firstName', label: 'First Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'source', label: 'Source' },
  { value: 'status', label: 'Status' },
  { value: 'tags', label: 'Tags' },
  { value: 'value', label: 'Deal Value' },
];

const OPERATOR_OPTIONS = [
  { value: 'EQUALS', label: 'Equals' },
  { value: 'NOT_EQUALS', label: 'Not Equals' },
  { value: 'CONTAINS', label: 'Contains' },
  { value: 'GREATER_THAN', label: 'Greater Than' },
  { value: 'LESS_THAN', label: 'Less Than' },
  { value: 'IN', label: 'In List (comma-separated)' },
  { value: 'NOT_IN', label: 'Not In List' },
];

const ACTION_OPTIONS = [
  { value: 'update_lead_status', label: 'Update Lead Status' },
  { value: 'assign_lead', label: 'Assign Lead' },
  { value: 'add_tag', label: 'Add Tag' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'send_notification', label: 'Send Notification' },
  { value: 'send_instagram_message', label: 'Send Instagram Message' },
  { value: 'rescore_lead', label: 'Rescore Lead (AI)' },
  { value: 'send_whatsapp_template', label: 'Send WhatsApp Template' },
  { value: 'outbound_webhook', label: 'Outbound Webhook (POST)' },
];

const LEAD_STATUS_OPTIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'LOST', label: 'Lost' },
];

export function WorkflowFormBuilder({
  initialData,
  onSave,
  onCancel,
  isSaving = false,
}: WorkflowFormBuilderProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('LEAD_CREATED');
  const [isActive, setIsActive] = useState(true);
  const [conditions, setConditions] = useState<{ field: string; operator: string; value: string }[]>([]);
  const [actions, setActions] = useState<{ type: string; config: Record<string, any> }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setDescription(initialData.description || '');
      setTriggerType(initialData.triggerType);
      setIsActive(initialData.isActive);

      // Flatten conditions (assume they are field conditions at top-level array for UI simplicity)
      const def = initialData.definition;
      const condList = (def.conditions || []).map((c: any) => ({
        field: c.field || 'status',
        operator: c.operator || 'EQUALS',
        value: typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value ?? ''),
      }));
      setConditions(condList);

      const actList = (def.actions || []).map((a: any) => ({
        type: a.type,
        config: a.config || {},
      }));
      setActions(actList);
    }
  }, [initialData]);

  const handleAddCondition = () => {
    setConditions([...conditions, { field: 'status', operator: 'EQUALS', value: '' }]);
  };

  const handleRemoveCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleConditionChange = (index: number, key: string, val: string) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index]!, [key]: val };
    setConditions(updated);
  };

  const handleAddAction = () => {
    setActions([...actions, { type: 'add_tag', config: { tag: '' } }]);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleActionTypeChange = (index: number, type: string) => {
    const updated = [...actions];
    let config: Record<string, any> = {};
    if (type === 'update_lead_status') {
      config = { status: 'NEW' };
    } else if (type === 'assign_lead') {
      config = { userId: '' };
    } else if (type === 'add_tag') {
      config = { tag: '' };
    } else if (type === 'create_task') {
      config = { title: '' };
    } else if (type === 'send_notification') {
      config = { message: '' };
    } else if (type === 'send_instagram_message') {
      config = { body: '' };
    } else if (type === 'send_whatsapp_template') {
      config = { accountId: '', templateName: '', templateLanguage: 'en' };
    } else if (type === 'outbound_webhook') {
      config = { url: '', headers: '', body: '' };
    }
    updated[index] = { type, config };
    setActions(updated);
  };

  const handleActionConfigChange = (index: number, key: string, val: any) => {
    const updated = [...actions];
    const item = updated[index]!;
    updated[index] = {
      ...item,
      config: {
        ...item.config,
        [key]: val,
      },
    };
    setActions(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Workflow Name is required');
      return;
    }
    if (actions.length === 0) {
      setError('At least one action is required');
      return;
    }

    setError(null);

    // Map conditions
    const formattedConditions: WorkflowCondition[] = conditions.map((c) => {
      let finalVal: any = c.value;
      if (c.operator === 'IN' || c.operator === 'NOT_IN') {
        finalVal = c.value.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (!isNaN(Number(c.value)) && c.value.trim() !== '') {
        finalVal = Number(c.value);
      }
      return {
        field: c.field,
        operator: c.operator as any,
        value: finalVal,
      };
    });

    const definition: WorkflowDefinition = {
      trigger: {
        type: triggerType as any,
        config: {},
      },
      conditions: formattedConditions,
      actions: actions.map((a) => ({
        type: a.type as any,
        config: a.config,
      })),
    };

    onSave({
      name,
      description,
      triggerType,
      isActive,
      definition,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl bg-bg-elevated border border-border rounded-xl p-6 shadow-sm">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* General Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Workflow Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Auto assign form leads"
            className="w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Status</label>
          <div className="flex items-center gap-4 mt-2">
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-text-primary">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 text-primary-600 border-border bg-bg-base rounded focus:ring-primary-500 focus:ring-2 focus:ring-offset-0 focus:outline-none"
              />
              Active (Triggers will execute)
            </label>
          </div>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the purpose of this automation workflow..."
            rows={2}
            className="w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500 resize-none"
          />
        </div>
      </div>

      <hr className="border-border/50" />

      {/* Trigger selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">1. When this event occurs</h3>
        </div>
        <div className="w-72">
          <Select
            value={triggerType}
            onValueChange={setTriggerType}
            options={TRIGGER_OPTIONS}
          />
        </div>
      </div>

      <hr className="border-border/50" />

      {/* Conditions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">2. If these conditions are met (optional)</h3>
          <Button type="button" variant="secondary" size="sm" onClick={handleAddCondition}>
            + Add Condition
          </Button>
        </div>

        {conditions.length === 0 ? (
          <p className="text-xs text-text-tertiary italic">No conditions configured. Runs for all triggers.</p>
        ) : (
          <div className="space-y-3">
            {conditions.map((cond, index) => (
              <div key={index} className="flex flex-wrap items-center gap-3 p-3 bg-bg-base rounded-lg border border-border">
                <div className="w-44">
                  <Select
                    value={cond.field}
                    onValueChange={(val) => handleConditionChange(index, 'field', val)}
                    options={FIELD_OPTIONS}
                  />
                </div>
                <div className="w-48">
                  <Select
                    value={cond.operator}
                    onValueChange={(val) => handleConditionChange(index, 'operator', val)}
                    options={OPERATOR_OPTIONS}
                  />
                </div>
                <div className="flex-1 min-w-[150px]">
                  {cond.field === 'status' ? (
                    <Select
                      value={cond.value}
                      onValueChange={(val) => handleConditionChange(index, 'value', val)}
                      options={LEAD_STATUS_OPTIONS}
                    />
                  ) : (
                    <input
                      type="text"
                      value={cond.value}
                      onChange={(e) => handleConditionChange(index, 'value', e.target.value)}
                      placeholder="Enter value"
                      className="w-full px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500"
                    />
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveCondition(index)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <hr className="border-border/50" />

      {/* Actions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">3. Perform these actions</h3>
          <Button type="button" variant="secondary" size="sm" onClick={handleAddAction}>
            + Add Action
          </Button>
        </div>

        {actions.length === 0 ? (
          <p className="text-xs text-red-400 italic">Please add at least one action to execute.</p>
        ) : (
          <div className="space-y-3">
            {actions.map((act, index) => (
              <div key={index} className="space-y-3 p-4 bg-bg-base rounded-lg border border-border">
                <div className="flex items-center justify-between">
                  <div className="w-64">
                    <Select
                      value={act.type}
                      onValueChange={(val) => handleActionTypeChange(index, val)}
                      options={ACTION_OPTIONS}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAction(index)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    ✕ Remove
                  </Button>
                </div>

                {/* Dynamic configurations */}
                <div className="pl-4 border-l-2 border-border/80 space-y-3">
                  {act.type === 'update_lead_status' && (
                    <div className="w-56 space-y-1">
                      <label className="text-xs text-text-secondary font-medium">New Status</label>
                      <Select
                        value={act.config.status || 'NEW'}
                        onValueChange={(val) => handleActionConfigChange(index, 'status', val)}
                        options={LEAD_STATUS_OPTIONS}
                      />
                    </div>
                  )}

                  {act.type === 'assign_lead' && (
                    <div className="max-w-md space-y-1">
                      <label className="text-xs text-text-secondary font-medium">User ID to Assign</label>
                      <input
                        type="text"
                        value={act.config.userId || ''}
                        onChange={(e) => handleActionConfigChange(index, 'userId', e.target.value)}
                        placeholder="UUID of user"
                        className="w-full px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  )}

                  {act.type === 'add_tag' && (
                    <div className="max-w-md space-y-1">
                      <label className="text-xs text-text-secondary font-medium">Tag Name</label>
                      <input
                        type="text"
                        value={act.config.tag || ''}
                        onChange={(e) => handleActionConfigChange(index, 'tag', e.target.value)}
                        placeholder="e.g. cold-lead"
                        className="w-full px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  )}

                  {act.type === 'create_task' && (
                    <div className="max-w-lg space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs text-text-secondary font-medium">Task Title</label>
                        <input
                          type="text"
                          value={act.config.title || ''}
                          onChange={(e) => handleActionConfigChange(index, 'title', e.target.value)}
                          placeholder="e.g. Call lead back"
                          className="w-full px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-text-secondary font-medium">Due in Days (optional)</label>
                        <input
                          type="number"
                          value={act.config.dueInDays || ''}
                          onChange={(e) => handleActionConfigChange(index, 'dueInDays', Number(e.target.value))}
                          placeholder="e.g. 2"
                          className="w-24 px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>
                  )}

                  {act.type === 'send_notification' && (
                    <div className="max-w-lg space-y-1">
                      <label className="text-xs text-text-secondary font-medium">Notification Message</label>
                      <input
                        type="text"
                        value={act.config.message || ''}
                        onChange={(e) => handleActionConfigChange(index, 'message', e.target.value)}
                        placeholder="e.g. A new lead was created from the website"
                        className="w-full px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  )}

                  {act.type === 'send_instagram_message' && (
                    <div className="max-w-lg space-y-1">
                      <label className="text-xs text-text-secondary font-medium">Instagram Message Body</label>
                      <textarea
                        value={act.config.body || ''}
                        onChange={(e) => handleActionConfigChange(index, 'body', e.target.value)}
                        placeholder="Write the message text here..."
                        rows={3}
                        className="w-full px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500 resize-none"
                      />
                    </div>
                  )}

                  {act.type === 'rescore_lead' && (
                    <p className="text-xs text-text-tertiary italic">No configuration needed. Automatically triggers AI rescoring on the lead.</p>
                  )}

                  {act.type === 'send_whatsapp_template' && (
                    <div className="max-w-lg space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs text-text-secondary font-medium">WhatsApp Account ID</label>
                        <input
                          type="text"
                          value={act.config.accountId || ''}
                          onChange={(e) => handleActionConfigChange(index, 'accountId', e.target.value)}
                          placeholder="UUID of the connected WABA account"
                          className="w-full px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-text-secondary font-medium">Template Name</label>
                        <input
                          type="text"
                          value={act.config.templateName || ''}
                          onChange={(e) => handleActionConfigChange(index, 'templateName', e.target.value)}
                          placeholder="e.g. welcome_message"
                          className="w-full px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-text-secondary font-medium">Language Code</label>
                        <input
                          type="text"
                          value={act.config.templateLanguage || 'en'}
                          onChange={(e) => handleActionConfigChange(index, 'templateLanguage', e.target.value)}
                          placeholder="e.g. en, en_US, pt_BR"
                          className="w-32 px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>
                  )}

                  {act.type === 'outbound_webhook' && (
                    <div className="max-w-lg space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs text-text-secondary font-medium">Webhook URL (HTTPS only)</label>
                        <input
                          type="url"
                          value={act.config.url || ''}
                          onChange={(e) => handleActionConfigChange(index, 'url', e.target.value)}
                          placeholder="https://hooks.example.com/lead-notify"
                          className="w-full px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500"
                        />
                        <p className="text-xs text-text-tertiary">Private/loopback IPs are blocked for security (SSRF guard).</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-text-secondary font-medium">Custom Headers (JSON, optional)</label>
                        <textarea
                          value={act.config.headers || ''}
                          onChange={(e) => handleActionConfigChange(index, 'headers', e.target.value)}
                          placeholder='{"X-Secret": "my-token"}'
                          rows={2}
                          className="w-full px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500 font-mono resize-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-text-secondary font-medium">Body Override (JSON, optional)</label>
                        <textarea
                          value={act.config.body || ''}
                          onChange={(e) => handleActionConfigChange(index, 'body', e.target.value)}
                          placeholder='{"source": "leados"}'
                          rows={2}
                          className="w-full px-3 py-1.5 text-sm bg-bg-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500 font-mono resize-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <hr className="border-border/50" />

      {/* Buttons */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Workflow'}
        </Button>
      </div>
    </form>
  );
}
