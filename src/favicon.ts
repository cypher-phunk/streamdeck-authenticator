const cache = new Map<string, string>();

function normalizeDomain(website: string): string {
	return website
		.replace(/^https?:\/\//, "")
		.replace(/\/.*$/, "")
		.trim()
		.toLowerCase();
}

async function tryFetch(url: string): Promise<string | null> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!response.ok) return null;
		const buffer = await response.arrayBuffer();
		if (buffer.byteLength < 64) return null; // skip empty/tiny responses
		const mimeType = response.headers.get("content-type")?.split(";")[0].trim() ?? "image/png";
		const base64 = Buffer.from(buffer).toString("base64");
		return `data:${mimeType};base64,${base64}`;
	} catch {
		return null;
	}
}

/**
 * Fetches a favicon for the given website domain.
 * Tries direct /favicon.ico first, then falls back to Google's favicon API.
 * Results are cached in memory for the lifetime of the plugin process.
 */
export async function fetchFavicon(website: string): Promise<string | null> {
	const domain = normalizeDomain(website);
	if (!domain) return null;

	if (cache.has(domain)) return cache.get(domain) ?? null;

	// Primary: fetch directly from the domain
	let dataUrl = await tryFetch(`https://${domain}/favicon.ico`);

	// Fallback: Google favicon API
	if (!dataUrl) {
		dataUrl = await tryFetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`);
	}

	if (dataUrl) {
		cache.set(domain, dataUrl);
	}
	return dataUrl;
}

/** Removes a domain's cached favicon so it will be re-fetched on next use. */
export function invalidateFaviconCache(website: string): void {
	const domain = normalizeDomain(website);
	cache.delete(domain);
}
