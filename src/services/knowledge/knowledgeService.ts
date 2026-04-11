import { invoke } from '@tauri-apps/api/core';
import type {
    KnowledgeDeleteRequest,
    KnowledgeEntryListResponse,
    KnowledgeIngestRequest,
    KnowledgeMoveRequest,
    KnowledgeQueryRequest,
    KnowledgeQueryResponse,
    KnowledgePolicyUpdateRequest,
    KnowledgeRebuildRequest,
    KnowledgeRecoveryResponse,
    KnowledgeRenameRequest,
    KnowledgeReplaceRequest,
    KnowledgeRetryRequest,
    KnowledgeVerificationUpdateRequest,
    KnowledgeWorkspaceSnapshotUpsertRequest,
    KnowledgeWriteResponse,
} from '../../types/knowledge';

export const knowledgeService = {
    async ingestDocument(
        workspacePath: string,
        request: KnowledgeIngestRequest,
    ): Promise<KnowledgeWriteResponse> {
        return invoke<KnowledgeWriteResponse>('ingest_knowledge_document', {
            workspacePath,
            request,
        });
    },

    async replaceDocument(
        workspacePath: string,
        request: KnowledgeReplaceRequest,
    ): Promise<KnowledgeWriteResponse> {
        return invoke<KnowledgeWriteResponse>('replace_knowledge_document', {
            workspacePath,
            request,
        });
    },

    async upsertWorkspaceSnapshot(
        workspacePath: string,
        request: KnowledgeWorkspaceSnapshotUpsertRequest,
    ): Promise<KnowledgeWriteResponse> {
        return invoke<KnowledgeWriteResponse>('upsert_workspace_snapshot_to_knowledge', {
            workspacePath,
            request,
        });
    },

    async deleteEntry(
        workspacePath: string,
        request: KnowledgeDeleteRequest,
    ): Promise<KnowledgeWriteResponse> {
        return invoke<KnowledgeWriteResponse>('delete_knowledge_entry', {
            workspacePath,
            request,
        });
    },

    async renameEntry(
        workspacePath: string,
        request: KnowledgeRenameRequest,
    ): Promise<KnowledgeWriteResponse> {
        return invoke<KnowledgeWriteResponse>('rename_knowledge_entry', {
            workspacePath,
            request,
        });
    },

    async moveEntry(
        workspacePath: string,
        request: KnowledgeMoveRequest,
    ): Promise<KnowledgeWriteResponse> {
        return invoke<KnowledgeWriteResponse>('move_knowledge_entry', {
            workspacePath,
            request,
        });
    },

    async queryKnowledgeBase(
        workspacePath: string,
        request: KnowledgeQueryRequest,
    ): Promise<KnowledgeQueryResponse> {
        return invoke<KnowledgeQueryResponse>('query_knowledge_base', {
            workspacePath,
            request,
        });
    },

    async rebuildEntry(
        workspacePath: string,
        request: KnowledgeRebuildRequest,
    ): Promise<KnowledgeRecoveryResponse> {
        return invoke<KnowledgeRecoveryResponse>('rebuild_knowledge_entry', {
            workspacePath,
            request,
        });
    },

    async retryEntry(
        workspacePath: string,
        request: KnowledgeRetryRequest,
    ): Promise<KnowledgeRecoveryResponse> {
        return invoke<KnowledgeRecoveryResponse>('retry_knowledge_entry', {
            workspacePath,
            request,
        });
    },

    async updateVerification(
        workspacePath: string,
        request: KnowledgeVerificationUpdateRequest,
    ): Promise<KnowledgeWriteResponse> {
        return invoke<KnowledgeWriteResponse>('update_knowledge_verification', {
            workspacePath,
            request,
        });
    },

    async updateEntryPolicy(
        workspacePath: string,
        request: KnowledgePolicyUpdateRequest,
    ): Promise<KnowledgeWriteResponse> {
        return invoke<KnowledgeWriteResponse>('update_knowledge_entry_policy', {
            workspacePath,
            request,
        });
    },

    async listEntries(
        workspacePath: string,
        params?: {
            knowledgeBaseId?: string | null;
            query?: string | null;
            limit?: number | null;
        },
    ): Promise<KnowledgeEntryListResponse> {
        return invoke<KnowledgeEntryListResponse>('list_knowledge_entries', {
            workspacePath,
            knowledgeBaseId: params?.knowledgeBaseId ?? null,
            query: params?.query ?? null,
            limit: params?.limit ?? 50,
        });
    },
};
