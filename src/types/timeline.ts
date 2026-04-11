export interface TimelineNode {
  nodeId: string;
  workspacePath: string;
  nodeType: 'file_content' | 'resource_structure' | 'restore_commit' | string;
  operationType: string;
  summary: string;
  impactScope: string[];
  actor: 'user' | 'ai' | 'system_restore' | string;
  restorable: boolean;
  restorePayloadId: string;
  createdAt: number;
}

export interface TimelineRestorePreview {
  node: TimelineNode;
  payloadKind: 'file_content' | 'resource_structure' | string;
}

export interface TimelineRestoreResult {
  impactedPaths: string[];
  createdNode: boolean;
}
