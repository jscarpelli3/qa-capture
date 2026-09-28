import { createHash } from "node:crypto";

export function aggregateReviews(parsedArchives) {
  const sources = [];
  const notes = [];
  const assets = [];
  const seenSourceKeys = new Set();

  for (const parsed of parsedArchives) {
    const { review } = parsed;
    sources.push({
      reviewId: review.header.id,
      reviewer: review.header.reviewer.name,
      startedAt: review.header.timing.startedAt,
      exportedAt: review.header.timing.exportedAt,
      origin: review.header.platform?.page?.origin ?? review.notes[0]?.page?.origin ?? null,
      noteCount: review.notes.length,
      sourceName: parsed.sourceName,
      archiveSha256: parsed.archiveSha256,
      generator: review.header.generator,
    });

    for (const note of review.notes) {
      const sourceKey = `${review.header.id}:${note.id}`;
      if (seenSourceKeys.has(sourceKey)) continue;
      seenSourceKeys.add(sourceKey);
      const mappedAssets = [];
      for (const assetId of note.assets || []) {
        const sourceAsset = parsed.assetsById.get(assetId);
        const aggregateAssetId = `${review.header.id}:${assetId}`;
        const extension = extensionForMime(sourceAsset.mime);
        const path = `assets/${safeSegment(review.header.id)}/${safeSegment(assetId)}.${extension}`;
        assets.push({
          id: aggregateAssetId,
          sourceReviewId: review.header.id,
          sourceAssetId: assetId,
          kind: sourceAsset.kind,
          mime: sourceAsset.mime,
          width: sourceAsset.width,
          height: sourceAsset.height,
          path,
          data: sourceAsset.data,
        });
        mappedAssets.push(aggregateAssetId);
      }
      notes.push({
        sourceKey,
        sourceReviewId: review.header.id,
        sourceNoteId: note.id,
        sequence: note.sequence,
        reviewer: review.header.reviewer.name,
        reviewStartedAt: review.header.timing.startedAt,
        createdAt: note.createdAt,
        kind: note.kind,
        text: note.text,
        page: note.page,
        target: note.target,
        viewport: note.viewport,
        diagnostics: note.diagnostics,
        captureWarnings: note.captureWarnings || [],
        assets: mappedAssets,
      });
    }
  }

  notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.sourceKey.localeCompare(b.sourceKey));
  const identity = sources.map((source) => source.archiveSha256).sort().join("\n");
  return {
    schema: "qa-review-aggregate/1",
    id: `aggregate_${createHash("sha256").update(identity).digest("hex").slice(0, 20)}`,
    generatedAt: new Date().toISOString(),
    summary: {
      reviewCount: sources.length,
      noteCount: notes.length,
      reviewerCount: new Set(sources.map((source) => source.reviewer)).size,
      pageCount: new Set(notes.map((note) => note.page?.url || note.page?.path)).size,
    },
    sources,
    notes,
    assets,
  };
}

export function serializableAggregate(aggregate) {
  return {
    ...aggregate,
    assets: aggregate.assets.map(({ data, ...metadata }) => metadata),
  };
}

function extensionForMime(mime) {
  return mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
}

function safeSegment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "item";
}
