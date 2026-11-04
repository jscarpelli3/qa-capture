export type ProjectSiteMode = "regular" | "shopify_preview";

const SHOPIFY_PREVIEW_HOST = /^([a-z0-9-]+)-(\d+)\.shopifypreview\.com$/i;

export function shopifyPreviewStoreId(input: string) {
  let url: URL;
  try { url = new URL(input); }
  catch { return null; }
  if (url.protocol !== "https:" || (url.port && url.port !== "443")) return null;
  return SHOPIFY_PREVIEW_HOST.exec(url.hostname)?.[2] || null;
}

export function assertSiteMode(mode: ProjectSiteMode, url: string) {
  if (mode !== "shopify_preview") return { shopifyStoreId: null };
  const shopifyStoreId = shopifyPreviewStoreId(url);
  if (!shopifyStoreId) {
    throw new Error("That is not a Shopify theme preview URL. It should end in -[store ID].shopifypreview.com.");
  }
  return { shopifyStoreId };
}

export function projectAllowsOrigin(
  mode: ProjectSiteMode,
  configuredOrigin: string,
  shopifyStoreId: string | null,
  requestOrigin: string,
) {
  let normalized: URL;
  try { normalized = new URL(requestOrigin); }
  catch { return false; }
  if (mode === "regular") return normalized.origin === configuredOrigin;
  return Boolean(shopifyStoreId && shopifyPreviewStoreId(normalized.origin) === shopifyStoreId);
}

export function invitationTarget(currentSiteUrl: string, originalPageUrl: string) {
  const current = new URL(currentSiteUrl);
  const original = new URL(originalPageUrl);
  current.pathname = original.pathname;
  current.search = original.search;
  current.hash = "";
  return current;
}
