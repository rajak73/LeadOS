import type { WorkflowCondition, FieldCondition, GroupCondition } from '@leados/shared';

export function evaluateCondition(condition: WorkflowCondition, entity: Record<string, unknown>): boolean {
  if ('type' in condition && (condition.type === 'AND' || condition.type === 'OR')) {
    return evaluateGroup(condition, entity);
  } else if ('field' in condition) {
    return evaluateField(condition as FieldCondition, entity);
  }
  return false;
}

function evaluateGroup(group: GroupCondition, entity: Record<string, unknown>): boolean {
  if (group.conditions.length === 0) return true;
  if (group.type === 'AND') {
    return group.conditions.every((c) => evaluateCondition(c, entity));
  } else {
    return group.conditions.some((c) => evaluateCondition(c, entity));
  }
}

function evaluateField(cond: FieldCondition, entity: Record<string, unknown>): boolean {
  // Extract value from entity or customFields
  let entityValue = entity[cond.field];
  if (entityValue === undefined && entity.customFields && typeof entity.customFields === 'object') {
    entityValue = (entity.customFields as Record<string, unknown>)[cond.field];
  }

  if (entityValue === undefined || entityValue === null) {
    if (cond.operator === 'NOT_EQUALS') {
      return cond.value !== null && cond.value !== undefined;
    }
    return false;
  }

  const value = cond.value;

  switch (cond.operator) {
    case 'EQUALS':
      return entityValue === value;
    case 'NOT_EQUALS':
      return entityValue !== value;
    case 'CONTAINS':
      if (Array.isArray(entityValue)) {
        return entityValue.includes(value);
      }
      if (typeof entityValue === 'string' && typeof value === 'string') {
        return entityValue.toLowerCase().includes(value.toLowerCase());
      }
      return false;
    case 'GREATER_THAN':
      return Number(entityValue) > Number(value);
    case 'LESS_THAN':
      return Number(entityValue) < Number(value);
    case 'IN':
      return Array.isArray(value) && value.includes(entityValue);
    case 'NOT_IN':
      return Array.isArray(value) && !value.includes(entityValue);
    default:
      return false;
  }
}
