import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/envelope.js';
import { WorkflowService } from './workflow.service.js';

export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}

  createWorkflow = async (req: Request, res: Response): Promise<void> => {
    const { name, description, triggerType, definition, isActive } = req.body;
    const workflow = await this.service.createWorkflow({
      name,
      description,
      triggerType,
      definition,
      isActive,
    });
    sendSuccess(res, workflow, 201);
  };

  listWorkflows = async (_req: Request, res: Response): Promise<void> => {
    const workflows = await this.service.listWorkflows();
    sendSuccess(res, workflows);
  };

  getWorkflow = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const workflow = await this.service.getWorkflow(id!);
    sendSuccess(res, workflow);
  };

  updateWorkflow = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { name, description, triggerType, definition, isActive } = req.body;
    const workflow = await this.service.updateWorkflow(id!, {
      name,
      description,
      triggerType,
      definition,
      isActive,
    });
    sendSuccess(res, workflow);
  };

  deleteWorkflow = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await this.service.deleteWorkflow(id!);
    sendSuccess(res, { success: true });
  };

  listRuns = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const runs = await this.service.listRuns(id);
    sendSuccess(res, runs);
  };

  getWorkflowMetadata = async (_req: Request, res: Response): Promise<void> => {
    const metadata = {
      triggers: ['LEAD_CREATED', 'LEAD_STATUS_CHANGED', 'DEAL_CREATED', 'DEAL_STAGE_MOVED', 'MESSAGE_RECEIVED'],
      fields: ['firstName', 'lastName', 'email', 'phone', 'source', 'status', 'tags', 'value'],
      operators: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'GREATER_THAN', 'LESS_THAN', 'IN', 'NOT_IN'],
      actions: [
        { type: 'update_lead_status', label: 'Update Lead Status' },
        { type: 'assign_lead', label: 'Assign Lead' },
        { type: 'add_tag', label: 'Add Tag' },
        { type: 'create_task', label: 'Create Task' },
        { type: 'send_notification', label: 'Send Notification' },
        { type: 'send_instagram_message', label: 'Send Instagram Message' },
        { type: 'rescore_lead', label: 'Rescore Lead (AI)' },
        { type: 'send_whatsapp_template', label: 'Send WhatsApp Template' },
        { type: 'outbound_webhook', label: 'Outbound Webhook (POST)' },
      ]
    };
    sendSuccess(res, metadata);
  };

}

export function createWorkflowController(): WorkflowController {
  const service = new WorkflowService();
  return new WorkflowController(service);
}
