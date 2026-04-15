export type LogoSource = "simpleicons" | "logodev";

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
 * Derives a Simple Icons slug from a domain name.
 * Uses the second-to-last segment (SLD) of the domain, which covers the vast
 * majority of brand names: github.com → "github", accounts.google.com → "google".
 */
function domainToSimpleIconsSlug(domain: string): string {
	const cleaned = domain.replace(/^www\./, "");
	const parts = cleaned.split(".");
	return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

async function fetchSimpleIcon(domain: string, color?: string): Promise<string | null> {
	const slug = domainToSimpleIconsSlug(domain);
	const colorPart = color ? `/${color}` : "";
	return tryFetch(`https://cdn.simpleicons.org/${encodeURIComponent(slug)}${colorPart}`);
}

async function fetchFavicons(domain: string): Promise<string | null> {
	return (
		(await tryFetch(`https://${domain}/favicon.ico`)) ??
		tryFetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`)
	);
}

/**
 * Fetches a logo for the given website domain.
 *
 * Source behaviour:
 *  - 'simpleicons': Simple Icons CDN (SVG) → favicon fallbacks. Skips logo.dev.
 *  - 'logodev':    logo.dev API (PNG, requires apiKey) → favicon fallbacks. Skips Simple Icons.
 *  - undefined (auto): Simple Icons → logo.dev (if apiKey) → favicon fallbacks.
 *
 * Simple Icons returns clean SVGs whose color can be controlled via the `color`
 * option (hex string without '#', e.g. "ffffff"). Omit for the brand's own color.
 * Logo.dev returns PNGs — `color` has no effect for that source.
 *
 * Results are NOT cached here — callers are expected to persist the returned
 * data URL in action settings so the logo survives navigation.
 */
export async function fetchLogo(
	website: string,
	options?: { apiKey?: string; source?: LogoSource; color?: string },
): Promise<string | null> {
	const domain = normalizeDomain(website);
	if (!domain) return null;

	const { apiKey, source, color } = options ?? {};

	if (source === "simpleicons") {
		return (await fetchSimpleIcon(domain, color)) ?? fetchFavicons(domain);
	}

	if (source === "logodev") {
		if (apiKey) {
			const url = `https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(apiKey)}&size=64&format=png`;
			const result = await tryFetch(url);
			if (result) return result;
		}
		return fetchFavicons(domain);
	}

	// auto: Simple Icons first (clean SVG), then logo.dev, then favicon fallbacks
	const si = await fetchSimpleIcon(domain, color);
	if (si) return si;

	if (apiKey) {
		const url = `https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(apiKey)}&size=64&format=png`;
		const result = await tryFetch(url);
		if (result) return result;
	}

	return fetchFavicons(domain);
}
