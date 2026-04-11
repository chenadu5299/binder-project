import { knowledgeService } from '../services/knowledge/knowledgeService';
import type { KnowledgeAssetKind, KnowledgeSourceRole } from '../types/knowledge';
import { ReferenceType, type KnowledgeBaseReference } from '../types/reference';

interface KnowledgeReferenceSeed {
    kbId: string;
    entryId?: string | null;
    documentId?: string | null;
    entryTitle: string;
    preview?: string | null;
    assetKind?: KnowledgeAssetKind | null;
}

export async function buildKnowledgeReference(
    workspacePath: string,
    seed: KnowledgeReferenceSeed,
): Promise<KnowledgeBaseReference> {
    let injectionSlices: KnowledgeBaseReference['injectionSlices'] = undefined;
    let citation: KnowledgeBaseReference['citation'] = undefined;
    let queryMetadata: KnowledgeBaseReference['queryMetadata'] = undefined;
    let warnings: KnowledgeBaseReference['warnings'] = undefined;

    try {
        const response = await knowledgeService.queryKnowledgeBase(workspacePath, {
            knowledgeBaseId: seed.kbId,
            entryId: seed.entryId ?? null,
            documentId: seed.documentId ?? null,
            query: seed.entryId ? seed.entryTitle : null,
            limit: 5,
            intent: seed.entryId && seed.assetKind !== 'structure_asset' ? 'citation' : 'recall',
            queryMode: seed.assetKind === 'structure_asset' ? 'structure_reference' : 'content',
            assetKindFilter: seed.assetKind ?? null,
        });
        injectionSlices = response.injectionSlices;
        citation = response.injectionSlices[0]?.citation ?? response.chunkHits[0]?.citation;
        queryMetadata = response.metadata;
        warnings = response.warnings;
    } catch {
        // 保持轻量引用，后续由 protocol adapter 再兜底查询
    }

    return {
        id: '',
        type: ReferenceType.KNOWLEDGE_BASE,
        createdAt: Date.now(),
        kbId: seed.kbId,
        kbName: 'Binder Knowledge Base',
        entryId: seed.entryId ?? undefined,
        documentId: seed.documentId ?? undefined,
        entryTitle: seed.entryTitle,
        assetKind: seed.assetKind ?? undefined,
        sourceRole: (seed.assetKind === 'structure_asset'
            ? 'structure_reference'
            : 'fact_knowledge') as KnowledgeSourceRole,
        query: seed.entryTitle,
        itemCount: injectionSlices?.length,
        preview: seed.preview ?? undefined,
        citation,
        injectionSlices,
        queryMetadata,
        warnings,
    };
}
