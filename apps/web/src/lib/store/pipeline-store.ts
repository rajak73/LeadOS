'use client';

import { create } from 'zustand';

interface PipelineStore {
  activePipelineId: string | null;
  setActivePipelineId: (id: string) => void;

  addDealModalOpen: boolean;
  addDealTargetStageId: string | null;
  openAddDealModal: (stageId: string) => void;
  closeAddDealModal: () => void;

  lostReasonModalOpen: boolean;
  lostReasonDealId: string | null;
  openLostReasonModal: (dealId: string) => void;
  closeLostReasonModal: () => void;
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  activePipelineId: null,
  setActivePipelineId: (id) => set({ activePipelineId: id }),

  addDealModalOpen: false,
  addDealTargetStageId: null,
  openAddDealModal: (stageId) => set({ addDealModalOpen: true, addDealTargetStageId: stageId }),
  closeAddDealModal: () => set({ addDealModalOpen: false, addDealTargetStageId: null }),

  lostReasonModalOpen: false,
  lostReasonDealId: null,
  openLostReasonModal: (dealId) => set({ lostReasonModalOpen: true, lostReasonDealId: dealId }),
  closeLostReasonModal: () => set({ lostReasonModalOpen: false, lostReasonDealId: null }),
}));
