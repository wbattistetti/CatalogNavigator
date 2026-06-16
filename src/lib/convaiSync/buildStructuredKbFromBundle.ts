/**
 * Builds structured KB text from a compiled AgentBundle for ElevenLabs upload.
 */
import type { AgentBundle } from '../agentBundleTypes';
import { buildStructuredConvaiKbExport } from '../convaiStructuredExport';

export const STRUCTURED_KB_DOC_KEY = 'structured-kb';

export interface StructuredKbDocPayload {
  logicalDocId: string;
  fileName: string;
  text: string;
}

/** Materializes the structured KB document to sync on ElevenLabs. */
export function buildStructuredKbDocFromBundle(bundle: AgentBundle): StructuredKbDocPayload {
  const exportResult = buildStructuredConvaiKbExport({
    documentName: bundle.meta.documentName,
    dictionary: bundle.dictionary,
    descriptions: bundle.corpusItems.map((item) => item.sourceText),
    analysis: bundle.analysis,
  });

  const safeName = bundle.meta.documentName.replace(/[^\w.\- ]+/g, '_').trim() || 'document';
  return {
    logicalDocId: STRUCTURED_KB_DOC_KEY,
    fileName: `${safeName} - KB strutturata`,
    text: exportResult.kbText,
  };
}
