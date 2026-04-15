import { create } from 'zustand';
import { Reference } from '../types/reference';

interface ReferenceState {
    referencesByTab: Map<string, Reference[]>;

    addReference: (tabId: string, ref: Reference) => string;
    removeReference: (tabId: string, refId: string) => void;
    getReferences: (tabId: string) => Reference[];
    clearReferences: (tabId: string) => void;
}

export const useReferenceStore = create<ReferenceState>((set, get) => {
    return {
        referencesByTab: new Map(),

        addReference: (tabId: string, ref: Reference) => {
            const id = ref.id || `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const createdAt = ref.createdAt || Date.now();
            const newRef = { ...ref, id, createdAt };

            const { referencesByTab } = get();
            const currentRefs = referencesByTab.get(tabId) || [];
            const existingIndex = currentRefs.findIndex(r => r.id === id);
            const newRefs = existingIndex >= 0
                ? currentRefs.map((r, idx) => idx === existingIndex ? newRef : r)
                : [...currentRefs, newRef];

            set({
                referencesByTab: new Map(referencesByTab).set(tabId, newRefs),
            });

            return id;
        },

        removeReference: (tabId: string, refId: string) => {
            const { referencesByTab } = get();
            const currentRefs = referencesByTab.get(tabId) || [];
            const newRefs = currentRefs.filter(ref => ref.id !== refId);

            set({
                referencesByTab: new Map(referencesByTab).set(tabId, newRefs),
            });
        },

        getReferences: (tabId: string) => {
            const { referencesByTab } = get();
            return referencesByTab.get(tabId) || [];
        },

        clearReferences: (tabId: string) => {
            const { referencesByTab } = get();
            const newMap = new Map(referencesByTab);
            newMap.delete(tabId);
            set({ referencesByTab: newMap });
        },
    };
});
