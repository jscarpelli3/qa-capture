declare module "@qa-capture/aggregate" {
  export interface ReviewNote {
    id: string; kind: string; text: string; createdAt: string;
    page: { url?: string; path?: string };
    viewport: { width: number; height: number };
    target: { selector?: string; xpath?: string; tag?: string; text?: string; html?: string; attributes?: Record<string, string>; styles?: Record<string, string>; anchor?: { url?: string; precision?: string }; interaction?: Record<string, unknown> };
    diagnostics?: { consoleErrors?: unknown[]; failedRequests?: unknown[] };
    assets: string[];
  }
  export interface QawellReview {
    schema: string;
    header: { id: string; reviewer?: { name?: string }; platform?: { page?: { url?: string } } };
    notes: ReviewNote[];
    assets: Array<Record<string, unknown>>;
  }
  export class ArchiveError extends Error { code: string }
  export function readZip(input: Buffer | Uint8Array): Map<string, Buffer>;
  export function createZip(entries: Array<{ name: string; data: Buffer | Uint8Array | string }>): Buffer;
  export function parseReviewArchive(input: Buffer | Uint8Array, sourceName?: string): {
    archiveSha256: string;
    manifest: Record<string, unknown>;
    review: {
      schema: string;
      header: QawellReview["header"];
      notes: QawellReview["notes"];
      assets: QawellReview["assets"];
    };
  };
}
