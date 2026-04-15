function normalizeDomain(website: string): string {
	return website
		.replace(/^https?:\/\//, "")
		.replace(/\/.*$/, "")
		.trim()
		.toLowerCase();
}

const SVG_SAFE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]);

async function tryFetch(url: string): Promise<string | null> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!response.ok) return null;
		const buffer = await response.arrayBuffer();
		if (buffer.byteLength < 64) return null; // skip empty/tiny responses
		const mimeType = response.headers.get("content-type")?.split(";")[0].trim() ?? "image/png";
		if (!SVG_SAFE_MIME_TYPES.has(mimeType)) return null; // .ico and similar won't render in SVG <image>
		const base64 = Buffer.from(buffer).toString("base64");
		return `data:${mimeType};base64,${base64}`;
	} catch {
		return null;
	}
}

/**
 * Fetches a logo for the given website domain.
 *
 * Priority:
 *  1. Logo.dev API (if `apiKey` is provided) — high-quality brand logos
 *  2. Direct /favicon.ico from the domain
 *  3. Google favicon API fallback
 *
 * Results are NOT cached here — callers are expected to persist the
 * returned data URL in action settings so the logo survives navigation.
 */
export async function fetchLogo(website: string, apiKey?: string): Promise<string | null> {
	const domain = normalizeDomain(website);
	if (!domain) return null;

	// 1. Logo.dev (high-quality brand logos)
	if (apiKey) {
		const logoDevUrl = `https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(apiKey)}&size=64&format=png`;
		const dataUrl = await tryFetch(logoDevUrl);
		if (dataUrl) return dataUrl;
	}

	// 2. Direct favicon.ico
	const faviconUrl = await tryFetch(`https://${domain}/favicon.ico`);
	if (faviconUrl) return faviconUrl;

	// 3. Google favicon API
	return tryFetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`);
}
