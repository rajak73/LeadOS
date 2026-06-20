// Canonical plan limits — the SINGLE source of truth (BILL-4.1 / R-ARCH-4).
// Reconciles the previously-divergent numbers across blueprint docs 07/13/16 by making
// the two axes explicit: a MONTHLY quota and an HOURLY burst cap for AI.
// Every create-path imports this; nothing hardcodes limits locally.

import type { SubscriptionPlan } from './enums.js';

export interface PlanLimits {
  /** team member seats (Infinity = unlimited) */
  seats: number;
  leads: number;
  contacts: number;
  pipelines: number;
  deals: number;
  activeWorkflows: number;
  customFieldsPerObject: number;
  instagramAccounts: number;
  whatsappAccounts: number;
  /** AI scoring calls per month */
  aiCallsPerMonth: number;
  /** AI calls per hour (burst protection, doc 13 §13.8) */
  aiCallsPerHour: number;
  dataExport: boolean;
  apiAccess: boolean;
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  TRIAL: {
    seats: 3,
    leads: 500,
    contacts: 500,
    pipelines: 1,
    deals: 250,
    activeWorkflows: 5,
    customFieldsPerObject: 10,
    instagramAccounts: 1,
    whatsappAccounts: 0,
    aiCallsPerMonth: 500,
    aiCallsPerHour: 50,
    dataExport: false,
    apiAccess: false,
  },
  STARTER: {
    seats: 3,
    leads: 500,
    contacts: 500,
    pipelines: 1,
    deals: 1000,
    activeWorkflows: 5,
    customFieldsPerObject: 10,
    instagramAccounts: 1,
    whatsappAccounts: 0,
    aiCallsPerMonth: 500,
    aiCallsPerHour: 200,
    dataExport: false,
    apiAccess: false,
  },
  GROWTH: {
    seats: 10,
    leads: 5000,
    contacts: 10000,
    pipelines: 5,
    deals: Number.POSITIVE_INFINITY,
    activeWorkflows: 25,
    customFieldsPerObject: 30,
    instagramAccounts: 3,
    whatsappAccounts: 1,
    aiCallsPerMonth: 5000,
    aiCallsPerHour: 1000,
    dataExport: true,
    apiAccess: false,
  },
  SCALE: {
    seats: Number.POSITIVE_INFINITY,
    leads: Number.POSITIVE_INFINITY,
    contacts: Number.POSITIVE_INFINITY,
    pipelines: Number.POSITIVE_INFINITY,
    deals: Number.POSITIVE_INFINITY,
    activeWorkflows: Number.POSITIVE_INFINITY,
    customFieldsPerObject: 50,
    instagramAccounts: 10,
    whatsappAccounts: 5,
    aiCallsPerMonth: Number.POSITIVE_INFINITY,
    aiCallsPerHour: Number.POSITIVE_INFINITY,
    dataExport: true,
    apiAccess: true,
  },
};
