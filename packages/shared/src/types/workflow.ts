import { z } from 'zod';

export const WorkflowTriggerType = z.enum([
  'LEAD_CREATED',
  'LEAD_STATUS_CHANGED',
  'DEAL_CREATED',
  'DEAL_STAGE_MOVED',
  'MESSAGE_RECEIVED',
  'LEAD_SCORE_CHANGED',
  'LEAD_NO_RESPONSE'
]);
export type WorkflowTriggerType = z.infer<typeof WorkflowTriggerType>;

export const ConditionOperator = z.enum([
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'GREATER_THAN',
  'LESS_THAN',
  'IN',
  'NOT_IN'
]);
export type ConditionOperator = z.infer<typeof ConditionOperator>;

export interface FieldCondition {
  field: string;
  operator: ConditionOperator;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value?: any;
}

export interface GroupCondition {
  type: 'AND' | 'OR';
  conditions: WorkflowCondition[];
}

export type WorkflowCondition = FieldCondition | GroupCondition;

export const FieldConditionSchema: z.ZodType<FieldCondition> = z.object({
  field: z.string(),
  operator: ConditionOperator,
  value: z.any()
});

export const GroupConditionSchema: z.ZodType<GroupCondition> = z.lazy(() =>
  z.object({
    type: z.enum(['AND', 'OR']),
    conditions: z.array(WorkflowConditionSchema)
  })
);

export const WorkflowConditionSchema: z.ZodType<WorkflowCondition> = z.union([
  FieldConditionSchema,
  GroupConditionSchema
]);

export const ActionType = z.enum([
  'update_lead_status',
  'assign_lead',
  'add_tag',
  'create_task',
  'send_notification',
  'send_instagram_message',
  'rescore_lead',
  'send_whatsapp_template',
  'outbound_webhook',
  'send_email',
  'delay'
]);
export type ActionType = z.infer<typeof ActionType>;

export const WorkflowActionSchema = z.object({
  type: ActionType,
  config: z.record(z.any())
});
export type WorkflowAction = z.infer<typeof WorkflowActionSchema>;

export const WorkflowDefinitionSchema = z.object({
  trigger: z.object({
    type: WorkflowTriggerType,
    config: z.record(z.any()).optional()
  }),
  conditions: z.array(WorkflowConditionSchema).optional().default([]),
  actions: z.array(WorkflowActionSchema)
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
