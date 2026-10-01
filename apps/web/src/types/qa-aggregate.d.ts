declare module "@qa-capture/aggregate" {
  export interface ReviewNote {
    id: string; kind: string; text: string; createdAt: string;
    page: { url?: string; path?: string };
    viewport: { width: number; height: number };
    target: { selector?: string; tag?: string; text?: string; html?: string };
    assets: string[];
  }
  export interface QawellReview {
    schema: string;
    header: { id: string; reviewer?: { name?: string }; platform?: { page?: { url?: string } } };
    notes: ReviewNote[];
    assets: Array<Record<string, unknown>>;
  }
  export class ArchiveError extends Error { code: string }
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
