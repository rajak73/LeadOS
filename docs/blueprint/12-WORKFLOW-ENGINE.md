# 12 — Workflow Engine Design

---

## 12.1 Architecture Overview

The Workflow Engine is a no-code automation system that allows org administrators to define rules that automatically respond to events in the system.

```
[System Event] → [Trigger Evaluator] → [Condition Evaluator] → [Action Executor]
                         │                      │                      │
                    (Is this event         (Do conditions         (Execute each
                    a registered            match?)                action in
                    trigger?)                                       sequence)
```

**Key Design Decisions:**
- Workflows run **asynchronously** via BullMQ (never on the critical API path)
- Conditions evaluated in-memory (no additional DB queries if data passed in event)
- Actions execute sequentially (not parallel) to avoid race conditions
- Each action is idempotent where possible
- Failed actions don't stop subsequent actions (each action result logged independently)

---

## 12.2 Workflow Data Model (JSONB)

### Trigger Schema
```json
{
  "type": "LEAD_CREATED",
  "config": {}
}
```
```json
{
  "type": "LEAD_STATUS_CHANGED",
  "config": {
    "fromStatus": "NEW",
    "toStatus": "QUALIFIED"
  }
}
```
```json
{
  "type": "TIME_DELAY",
  "config": {
    "delayAmount": 2,
    "delayUnit": "days",
    "relativeToTrigger": "LEAD_CREATED"
  }
}
```

### Condition Schema
```json
[
  {
    "id": "cond-1",
    "field": "lead.source",
    "operator": "EQUALS",
    "value": "INSTAGRAM_DM",
    "logicalOperator": "AND"
  },
  {
    "id": "cond-2", 
    "field": "lead.aiScore",
    "operator": "GREATER_THAN",
    "value": 70,
    "logicalOperator": "AND"
  },
  {
    "id": "cond-3",
    "field": "lead.assignedToId",
    "operator": "IS_NOT_NULL",
    "value": null,
    "logicalOperator": null
  }
]
```

### Action Schema
```json
[
  {
    "id": "action-1",
    "type": "SEND_EMAIL",
    "config": {
      "to": "{{lead.email}}",
      "templateId": "welcome-email",
      "variables": {
        "firstName": "{{lead.firstName}}",
        "assigneeName": "{{lead.assignedTo.firstName}}"
      }
    }
  },
  {
    "id": "action-2",
    "type": "WAIT",
    "config": {
      "delayAmount": 30,
      "delayUnit": "minutes"
    }
  },
  {
    "id": "action-3",
    "type": "SEND_INSTAGRAM_DM",
    "config": {
      "message": "Hi {{lead.firstName}}! Thanks for reaching out. I'm {{assignee.firstName}} and I'll be helping you today. Can we schedule a quick call?"
    }
  },
  {
    "id": "action-4",
    "type": "CREATE_TASK",
    "config": {
      "title": "Follow up with {{lead.firstName}}",
      "type": "CALL",
      "priority": "HIGH",
      "dueInHours": 24,
      "assignTo": "lead.assignedToId"
    }
  }
]
```

---

## 12.3 Trigger Registry

| Trigger ID | Event | Payload |
|---|---|---|
| `LEAD_CREATED` | New lead added | `{ lead, organization }` |
| `LEAD_STATUS_CHANGED` | Lead status changes | `{ lead, fromStatus, toStatus }` |
| `LEAD_ASSIGNED` | Lead assigned to user | `{ lead, assignedTo }` |
| `DEAL_STAGE_CHANGED` | Deal moves in pipeline | `{ deal, fromStage, toStage }` |
| `DEAL_WON` | Deal marked Won | `{ deal, contact }` |
| `DEAL_LOST` | Deal marked Lost | `{ deal, lostReason }` |
| `INSTAGRAM_MESSAGE_RECEIVED` | New IG DM | `{ message, conversation, lead }` |
| `WHATSAPP_MESSAGE_RECEIVED` | New WhatsApp message | `{ message, conversation, lead }` |
| `TASK_OVERDUE` | Task past due date | `{ task, assignedTo }` |
| `LEAD_SCORE_CHANGED` | AI score changes ≥10 pts | `{ lead, fromScore, toScore }` |
| `CONTACT_CREATED` | New contact created | `{ contact }` |

---

## 12.4 Condition Operators

| Operator | Types | Example |
|---|---|---|
| `EQUALS` | string, enum, boolean | `status EQUALS "NEW"` |
| `NOT_EQUALS` | string, enum | `source NOT_EQUALS "MANUAL"` |
| `CONTAINS` | string, array | `tags CONTAINS "hot"` |
| `NOT_CONTAINS` | string, array | `tags NOT_CONTAINS "cold"` |
| `GREATER_THAN` | number | `aiScore GREATER_THAN 70` |
| `LESS_THAN` | number | `aiScore LESS_THAN 30` |
| `BETWEEN` | number | `value BETWEEN [100000, 500000]` |
| `IS_NULL` | any | `email IS_NULL` |
| `IS_NOT_NULL` | any | `assignedToId IS_NOT_NULL` |
| `IN` | enum list | `status IN ["NEW", "CONTACTED"]` |
| `NOT_IN` | enum list | `source NOT_IN ["MANUAL"]` |
| `STARTS_WITH` | string | `firstName STARTS_WITH "A"` |

---

## 12.5 Variable Interpolation

All string action configs support Mustache-style variable interpolation:

| Variable | Resolves To |
|---|---|
| `{{lead.firstName}}` | Lead's first name |
| `{{lead.lastName}}` | Lead's last name |
| `{{lead.email}}` | Lead's email |
| `{{lead.phone}}` | Lead's phone |
| `{{lead.status}}` | Lead's current status |
| `{{lead.aiScore}}` | Lead's AI score |
| `{{lead.assignedTo.firstName}}` | Assignee's first name |
| `{{deal.title}}` | Deal title |
| `{{deal.value}}` | Deal value |
| `{{deal.stage.name}}` | Current stage name |
| `{{org.name}}` | Organization name |
| `{{currentDate}}` | Today's date (ISO 8601) |
| `{{currentTime}}` | Current time |

---

## 12.6 Engine Implementation

### Trigger Evaluation Flow
```typescript
// modules/workflow/engine/triggerEvaluator.ts

export class TriggerEvaluator {
  async findMatchingWorkflows(
    orgId: string,
    eventType: string,
    eventPayload: Record<string, unknown>
  ): Promise<Workflow[]> {
    // Get all active workflows for this org
    const workflows = await this.db.workflow.findMany({
      where: {
        organizationId: orgId,
        status: 'ACTIVE',
      }
    });
    
    // Filter by matching trigger type
    return workflows.filter(wf => {
      const trigger = wf.trigger as WorkflowTrigger;
      if (trigger.type !== eventType) return false;
      
      // For triggers with config (e.g., specific status transition)
      if (trigger.config && Object.keys(trigger.config).length > 0) {
        return this.matchesTriggerConfig(trigger.config, eventPayload);
      }
      
      return true;
    });
  }
  
  private matchesTriggerConfig(config: object, payload: object): boolean {
    // Config keys must all match payload values
    return Object.entries(config).every(([key, value]) => {
      return payload[key] === value;
    });
  }
}
```

### Condition Evaluation Flow
```typescript
// modules/workflow/engine/conditionEvaluator.ts

export class ConditionEvaluator {
  evaluate(
    conditions: WorkflowCondition[],
    context: Record<string, unknown>
  ): boolean {
    if (!conditions.length) return true; // No conditions = always pass
    
    let result = true;
    
    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i];
      const conditionResult = this.evaluateSingle(condition, context);
      
      if (i === 0) {
        result = conditionResult;
      } else {
        const previousLogicalOp = conditions[i - 1].logicalOperator;
        if (previousLogicalOp === 'AND') {
          result = result && conditionResult;
        } else if (previousLogicalOp === 'OR') {
          result = result || conditionResult;
        }
      }
    }
    
    return result;
  }
  
  private evaluateSingle(
    condition: WorkflowCondition,
    context: Record<string, unknown>
  ): boolean {
    const fieldValue = this.resolveField(condition.field, context);
    
    switch (condition.operator) {
      case 'EQUALS': return fieldValue === condition.value;
      case 'NOT_EQUALS': return fieldValue !== condition.value;
      case 'GREATER_THAN': return Number(fieldValue) > Number(condition.value);
      case 'LESS_THAN': return Number(fieldValue) < Number(condition.value);
      case 'CONTAINS': 
        return Array.isArray(fieldValue)
          ? fieldValue.includes(condition.value)
          : String(fieldValue).includes(String(condition.value));
      case 'IS_NULL': return fieldValue == null;
      case 'IS_NOT_NULL': return fieldValue != null;
      case 'IN': return (condition.value as unknown[]).includes(fieldValue);
      default: return false;
    }
  }
  
  private resolveField(field: string, context: object): unknown {
    // field = "lead.aiScore" → resolve to context.lead.aiScore
    return field.split('.').reduce((obj, key) => obj?.[key], context);
  }
}
```

### Action Executor
```typescript
// modules/workflow/engine/actionExecutor.ts

export class ActionExecutor {
  async execute(
    action: WorkflowAction,
    context: Record<string, unknown>,
    execution: WorkflowExecution
  ): Promise<ActionResult> {
    const interpolated = this.interpolateVariables(action.config, context);
    
    try {
      switch (action.type) {
        case 'SEND_EMAIL':
          return await this.emailAction.execute(interpolated, context);
          
        case 'SEND_INSTAGRAM_DM':
          return await this.instagramAction.execute(interpolated, context);
          
        case 'SEND_WHATSAPP_MESSAGE':
          return await this.whatsappAction.execute(interpolated, context);
          
        case 'CREATE_TASK':
          return await this.taskAction.execute(interpolated, context);
          
        case 'UPDATE_LEAD_FIELD':
          return await this.leadUpdateAction.execute(interpolated, context);
          
        case 'ASSIGN_LEAD':
          return await this.assignAction.execute(interpolated, context);
          
        case 'ADD_TAG':
          return await this.tagAction.execute(interpolated, context);
          
        case 'CREATE_NOTIFICATION':
          return await this.notificationAction.execute(interpolated, context);
          
        case 'WAIT':
          return await this.handleWait(action.config, execution);
          
        case 'WEBHOOK':
          return await this.webhookAction.execute(interpolated, context);
          
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } catch (error) {
      // Log failure but don't stop other actions
      return { success: false, error: error.message };
    }
  }
  
  private interpolateVariables(
    config: Record<string, string>,
    context: Record<string, unknown>
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(config).map(([key, value]) => [
        key,
        String(value).replace(/\{\{([^}]+)\}\}/g, (_, path) => {
          return String(this.resolveField(path.trim(), context) ?? '');
        })
      ])
    );
  }
}
```

---

## 12.7 Queue Architecture

### Job: `workflow-evaluation`
```typescript
{
  name: 'evaluate-workflow',
  data: {
    organizationId: 'uuid',
    eventType: 'LEAD_CREATED',
    eventPayload: { lead: {...} },
    triggeredAt: '2026-06-18T07:00:00Z'
  },
  opts: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100, // keep last 100 completed jobs
    removeOnFail: 1000
  }
}
```

### Wait/Delay Handling
When an action of type `WAIT` is encountered:
1. Save current execution state to `workflow_executions.actionsExecuted`
2. Create a new delayed BullMQ job: `resume-workflow-execution`
3. Delayed job fires after the specified delay
4. Job resumes from the action after the WAIT

---

## 12.8 Workflow Templates Library

Pre-built templates for common use cases (users can install and customize):

| Template | Trigger | Use Case |
|---|---|---|
| "Instagram Welcome" | Instagram DM received | Auto-reply with welcome message + create lead |
| "New Lead Notify" | Lead created | Notify assigned sales rep |
| "Hot Lead Alert" | Lead score > 80 | Alert manager + create urgent call task |
| "Follow-up Sequence" | Lead status = CONTACTED | 2-day follow-up task creation |
| "Deal Won Celebration" | Deal won | Notify entire team |
| "Stale Lead Reminder" | Task overdue | Send reminder to rep |
| "WhatsApp Drip" | Lead created (WhatsApp source) | 3-message drip sequence over 3 days |
