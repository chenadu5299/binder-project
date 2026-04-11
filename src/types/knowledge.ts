export type KnowledgeVerificationStatus = 'unverified' | 'verified' | 'needs_review';
export type KnowledgeDeletionStatus = 'active' | 'pending_delete' | 'deleted';
export type KnowledgeRetrievalStatus = 'eligible' | 'suppressed';
export type KnowledgeDocumentState = 'pending' | 'processing' | 'ready' | 'failed' | 'superseded' | 'deleted';
export type KnowledgeCitationStatus = 'active' | 'superseded' | 'deleted' | 'unavailable';
export type KnowledgeRetrievalMode = 'manual_query' | 'explicit' | 'automatic';
export type KnowledgeSourceStatus = 'ready' | 'missing' | 'unreadable';
export type KnowledgeSyncMode = 'none' | 'snapshot' | 'follow_source' | 'external_scheduled';
export type KnowledgeVisibilityScope = 'workspace' | 'explicit_only';
export type KnowledgeAccessPolicy = 'workspace_auto' | 'explicit_only' | 'blocked';
export type KnowledgeQueryIntent = 'recall' | 'citation' | 'augmentation';
export type KnowledgeAssetKind = 'standard' | 'structure_asset';
export type KnowledgeSourceRole = 'fact_knowledge' | 'structure_reference';
export type KnowledgeQueryMode = 'content' | 'structure_reference';
export type KnowledgeAssetKindFilter = 'standard' | 'structure_asset' | 'all';
export type KnowledgeRetrievalStrategy = 'lexical_only' | 'hybrid' | 'hybrid_with_rerank';

export interface KnowledgeBase {
    id: string;
    name: string;
    description?: string | null;
    createdAt: number;
    updatedAt: number;
}

export interface KnowledgeFolder {
    id: string;
    knowledgeBaseId: string;
    parentFolderId?: string | null;
    name: string;
    path: string;
    createdAt: number;
    updatedAt: number;
    deletedAt?: number | null;
}

export interface KnowledgeEntry {
    id: string;
    knowledgeBaseId: string;
    folderId?: string | null;
    title: string;
    entryType: string;
    assetKind: KnowledgeAssetKind;
    sourceType: string;
    sourceRef?: string | null;
    syncMode: KnowledgeSyncMode;
    visibilityScope: KnowledgeVisibilityScope;
    accessPolicy: KnowledgeAccessPolicy;
    activeDocumentId?: string | null;
    verificationStatus: KnowledgeVerificationStatus;
    deletionStatus: KnowledgeDeletionStatus;
    retrievalStatus: KnowledgeRetrievalStatus;
    sourceStatus: KnowledgeSourceStatus;
    sourceStatusMessage?: string | null;
    createdAt: number;
    updatedAt: number;
    deletedAt?: number | null;
}

export interface KnowledgeProvenance {
    sourceType: string;
    sourceRef?: string | null;
    workspacePath: string;
    snapshotMode: string;
    checksum: string;
}

export interface KnowledgeDocument {
    id: string;
    entryId: string;
    version: number;
    state: KnowledgeDocumentState;
    lifecycleStatus: string;
    contentText?: string | null;
    contentChecksum: string;
    parserKind: string;
    metadataJson?: Record<string, unknown> | null;
    structureMetadata?: KnowledgeStructureMetadata | null;
    provenance: KnowledgeProvenance;
    createdAt: number;
    updatedAt: number;
    readyAt?: number | null;
    supersededAt?: number | null;
    deletedAt?: number | null;
    sourceStatus: KnowledgeSourceStatus;
    sourceStatusMessage?: string | null;
}

export interface KnowledgeChunk {
    id: string;
    documentId: string;
    entryId: string;
    chunkIndex: number;
    chunkText: string;
    tokenEstimate: number;
    startOffset: number;
    endOffset: number;
    anchorText: string;
    state: string;
    createdAt: number;
    deletedAt?: number | null;
}

export interface KnowledgeStageEvent {
    objectType: string;
    objectId: string;
    stage: string;
    status: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    retryable: boolean;
    createdAt: number;
}

export interface KnowledgeCitation {
    citationKey: string;
    knowledgeBaseId: string;
    entryId: string;
    documentId: string;
    chunkId?: string | null;
    version: number;
    title: string;
    sourceType: string;
    sourceRef?: string | null;
    status: KnowledgeCitationStatus;
    provenance: KnowledgeProvenance;
}

export interface KnowledgeStructureMetadata {
    documentForm: string;
    structurePurpose: string;
    applicableScenarios: string[];
    sectionOutlineSummary: string;
    slotHints: string[];
    sourceNature: string;
    structureTags?: string[] | null;
    styleScope?: string | null;
    usageNotes?: string | null;
    sampleOrigin?: string | null;
}

export interface KnowledgeInjectionSlice {
    sliceId: string;
    entryId: string;
    documentId: string;
    chunkId?: string | null;
    assetKind: KnowledgeAssetKind;
    sourceRole: KnowledgeSourceRole;
    title: string;
    sourceLabel: string;
    content: string;
    retrievalMode: KnowledgeRetrievalMode;
    riskFlags: string[];
    citation?: KnowledgeCitation | null;
    provenance: KnowledgeProvenance;
    structureMetadata?: KnowledgeStructureMetadata | null;
    sourceStatus: KnowledgeSourceStatus;
    sourceStatusMessage?: string | null;
}

export interface KnowledgeChunkHit {
    chunk: KnowledgeChunk;
    entryTitle: string;
    version: number;
    score: number;
    snippet: string;
    citation: KnowledgeCitation;
}

export interface KnowledgeEntryHit {
    entry: KnowledgeEntry;
    activeDocumentId?: string | null;
    activeVersion?: number | null;
    bestScore: number;
    hitCount: number;
    citations: KnowledgeCitation[];
}

export interface KnowledgeDocumentHit {
    document: KnowledgeDocument;
    entryTitle: string;
    bestScore: number;
    excerpt: string;
    citations: KnowledgeCitation[];
}

export interface KnowledgeEntryListItem {
    entry: KnowledgeEntry;
    activeDocumentId?: string | null;
    activeVersion?: number | null;
    preview: string;
    citation?: KnowledgeCitation | null;
    structureMetadata?: KnowledgeStructureMetadata | null;
}

export interface KnowledgeEntryListResponse {
    knowledgeBase: KnowledgeBase;
    items: KnowledgeEntryListItem[];
}

export interface KnowledgeQueryWarning {
    code: string;
    message: string;
}

export interface KnowledgeQueryMetadata {
    intent: KnowledgeQueryIntent;
    queryMode: KnowledgeQueryMode;
    assetKindFilter: KnowledgeAssetKindFilter;
    strategy: KnowledgeRetrievalStrategy;
    effectiveStrategy: KnowledgeRetrievalStrategy;
    requireVerified: boolean;
    verifiedOnlyApplied: boolean;
    rerankEnabled: boolean;
}

export interface KnowledgeQueryResponse {
    knowledgeBase: KnowledgeBase;
    chunkHits: KnowledgeChunkHit[];
    entryHits: KnowledgeEntryHit[];
    documentHits: KnowledgeDocumentHit[];
    injectionSlices: KnowledgeInjectionSlice[];
    totalHits: number;
    warnings: KnowledgeQueryWarning[];
    metadata: KnowledgeQueryMetadata;
}

export interface KnowledgeWriteResponse {
    knowledgeBase: KnowledgeBase;
    entry: KnowledgeEntry;
    document?: KnowledgeDocument | null;
    chunkCount: number;
    stageEvents: KnowledgeStageEvent[];
}

export interface KnowledgeRecoveryResponse {
    knowledgeBase: KnowledgeBase;
    entry: KnowledgeEntry;
    document?: KnowledgeDocument | null;
    chunkCount: number;
    retriedStage?: string | null;
    stageEvents: KnowledgeStageEvent[];
}

export interface KnowledgeIngestRequest {
    knowledgeBaseId?: string | null;
    /** Folder 当前仍为预留对象，不属于封板主链。 */
    folderId?: string | null;
    title?: string | null;
    content?: string | null;
    sourcePath?: string | null;
    sourceRef?: string | null;
    sourceType?: string | null;
    assetKind?: KnowledgeAssetKind | null;
    structureMetadata?: KnowledgeStructureMetadata | null;
    metadata?: Record<string, unknown> | null;
    verificationStatus?: KnowledgeVerificationStatus | null;
}

export interface KnowledgeReplaceRequest {
    entryId: string;
    content?: string | null;
    sourcePath?: string | null;
    sourceRef?: string | null;
    assetKind?: KnowledgeAssetKind | null;
    structureMetadata?: KnowledgeStructureMetadata | null;
    metadata?: Record<string, unknown> | null;
}

export interface KnowledgeDeleteRequest {
    entryId: string;
}

export interface KnowledgeRenameRequest {
    entryId: string;
    title: string;
}

export interface KnowledgeMoveRequest {
    entryId: string;
    /** Folder 当前仍为预留对象，不属于封板主链。 */
    folderId?: string | null;
    sourceRef?: string | null;
}

export interface KnowledgeRebuildRequest {
    entryId: string;
    documentId?: string | null;
}

export interface KnowledgeRetryRequest {
    entryId: string;
}

export interface KnowledgeVerificationUpdateRequest {
    entryId: string;
    verificationStatus: KnowledgeVerificationStatus;
}

export interface KnowledgePolicyUpdateRequest {
    entryId: string;
    syncMode?: KnowledgeSyncMode | null;
    visibilityScope?: KnowledgeVisibilityScope | null;
    accessPolicy?: KnowledgeAccessPolicy | null;
}

export interface KnowledgeWorkspaceSnapshotUpsertRequest {
    knowledgeBaseId?: string | null;
    /** Folder 当前仍为预留对象，不属于封板主链。 */
    folderId?: string | null;
    sourcePath: string;
    title?: string | null;
    assetKind?: KnowledgeAssetKind | null;
    structureMetadata?: KnowledgeStructureMetadata | null;
    verificationStatus?: KnowledgeVerificationStatus | null;
}

export interface KnowledgeQueryRequest {
    query?: string | null;
    knowledgeBaseId?: string | null;
    entryId?: string | null;
    documentId?: string | null;
    limit?: number | null;
    includeDeleted?: boolean | null;
    intent?: KnowledgeQueryIntent | null;
    queryMode?: KnowledgeQueryMode | null;
    assetKindFilter?: KnowledgeAssetKindFilter | null;
    retrievalStrategy?: KnowledgeRetrievalStrategy | null;
    requireVerified?: boolean | null;
    structureDocumentForm?: string | null;
    structurePurpose?: string | null;
}
