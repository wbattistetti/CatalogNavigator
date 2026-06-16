/**
 * Upserts ElevenLabs KB documents and purges stale/orphan docs on agent update.
 */
import type { StructuredKbDocPayload } from './buildStructuredKbFromBundle';
import {
  buildConvaiKbAttachmentRefs,
  extractKnowledgeBaseDocumentIdsFromConvaiConfig,
} from './convaiKbExtract';
import {
  createConvaiKbTextDocument,
  deleteConvaiKbDocument,
  listConvaiKbDocuments,
  patchConvaiKbDocument,
} from './convaiProvisionApi';

export interface SyncConvaiKbInput {
  isAgentUpdate: boolean;
  kbDoc: StructuredKbDocPayload;
  kbRemoteByDocId: Record<string, string>;
  lastKbRemoteIds: string[];
  remoteIdsOnAgent: string[];
}

export interface SyncConvaiKbResult {
  kbRemoteByDocId: Record<string, string>;
  lastKbRemoteIds: string[];
  kbRefs: ReturnType<typeof buildConvaiKbAttachmentRefs>;
  purgedIds: string[];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function collectStaleRemoteIds(
  keptIds: Set<string>,
  kbRemoteByDocId: Record<string, string>,
  lastKbRemoteIds: string[],
  remoteIdsOnAgent: string[],
): string[] {
  const candidates = new Set<string>([
    ...Object.values(kbRemoteByDocId),
    ...lastKbRemoteIds,
    ...remoteIdsOnAgent,
  ]);
  return [...candidates].filter((id) => id && !keptIds.has(id));
}

async function collectOrphanRemoteIdsByFileName(
  fileName: string,
  keptIds: Set<string>,
): Promise<string[]> {
  const target = normalizeName(fileName);
  const library = await listConvaiKbDocuments();
  return library
    .filter((doc) => normalizeName(doc.name) === target && !keptIds.has(doc.id))
    .map((doc) => doc.id);
}

/** Upserts structured KB and purges stale/orphan remote documents on update. */
export async function syncConvaiKbDocuments(input: SyncConvaiKbInput): Promise<SyncConvaiKbResult> {
  const { kbDoc, kbRemoteByDocId } = input;
  const mapping = { ...kbRemoteByDocId };
  let remoteId = mapping[kbDoc.logicalDocId]?.trim() ?? '';

  if (remoteId) {
    try {
      await patchConvaiKbDocument(remoteId, { name: kbDoc.fileName, text: kbDoc.text });
    } catch {
      remoteId = '';
    }
  }

  if (!remoteId) {
    remoteId = await createConvaiKbTextDocument({ name: kbDoc.fileName, text: kbDoc.text });
    mapping[kbDoc.logicalDocId] = remoteId;
  }

  const keptIds = new Set([remoteId]);
  const purgedIds: string[] = [];

  if (input.isAgentUpdate) {
    const staleIds = collectStaleRemoteIds(
      keptIds,
      mapping,
      input.lastKbRemoteIds,
      input.remoteIdsOnAgent,
    );
    const orphanIds = await collectOrphanRemoteIdsByFileName(kbDoc.fileName, keptIds);
    const toPurge = [...new Set([...staleIds, ...orphanIds])];

    for (const id of toPurge) {
      const trimmed = id.trim();
      if (!trimmed || keptIds.has(trimmed)) continue;
      await deleteConvaiKbDocument(trimmed, { force: true });
      purgedIds.push(trimmed);
      for (const [key, value] of Object.entries(mapping)) {
        if (value === trimmed) delete mapping[key];
      }
    }
  }

  const lastKbRemoteIds = [...keptIds];
  const kbRefs = buildConvaiKbAttachmentRefs([{ remoteId, name: kbDoc.fileName }]);

  return {
    kbRemoteByDocId: mapping,
    lastKbRemoteIds,
    kbRefs,
    purgedIds,
  };
}

/** Reads remote KB ids currently attached to an agent config. */
export function readRemoteKbIdsOnAgent(conversationConfig: unknown): string[] {
  return extractKnowledgeBaseDocumentIdsFromConvaiConfig(conversationConfig);
}
