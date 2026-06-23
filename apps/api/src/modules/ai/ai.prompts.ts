import type { LeadContext } from '@leados/shared';

/**
 * Compiles a structured, context-rich prompt instructing the LLM to score a lead
 * and return the response in a structured JSON schema.
 */
export function compileScoringPrompt(context: LeadContext): string {
  const lead = context.lead;
  const fullName = `${lead.firstName} ${lead.lastName || ''}`.trim();
  const tagsStr = lead.tags.length > 0 ? lead.tags.join(', ') : 'None';
  const customFieldsStr = Object.keys(lead.customFields).length > 0
    ? JSON.stringify(lead.customFields, null, 2)
    : 'None';

  const activitiesStr = context.activities.length > 0
    ? context.activities
        .map(
          (act) =>
            `- [${act.createdAt}] (${act.type}) ${act.description}`
        )
        .join('\n')
    : 'No recent activity history.';

  return `You are an expert sales assistant scoring a sales lead to help sales representatives prioritize follow-ups.
Analyze the following lead properties and recent activity log:

---
LEAD DETAILS:
- Name: ${fullName}
- Source: ${lead.source}
- Status: ${lead.status}
- Email: ${lead.email || 'Not Provided'}
- Phone: ${lead.phone || 'Not Provided'}
- Tags: ${tagsStr}
- Custom Fields:
${customFieldsStr}

RECENT ACTIVITY LOG (Most recent first):
${activitiesStr}
---

INSTRUCTIONS:
1. Calculate a numeric score from 0 to 100 representing the lead's conversion quality (higher score means higher likelihood of conversion/reply).
2. Generate a list of specific positive or negative scoring factors (e.g., "Has email address (+20)", "No activity in past 48h (-10)").
3. Provide a clear prioritization recommendation (e.g., "Follow up within 4 hours", "Follow up within 24 hours", "Nurture").
4. Output your response as a raw JSON object matching the schema below. Do not wrap the JSON in markdown code blocks.

SCHEMA:
{
  "score": number,
  "factors": [
    {
      "type": "POSITIVE" | "NEGATIVE",
      "description": "Short explanation of the factor"
    }
  ],
  "recommendation": "string",
  "modelVersion": "string"
}
`;
}
