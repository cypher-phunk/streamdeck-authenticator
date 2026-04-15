import { DEFAULT_FONT } from "./globals.js";

export type RenderOptions = {
	/** Current OTP token (e.g. "123456"). Omit if secret not yet configured. */
	token?: string;
	/** Seconds remaining in the TOTP window. Omit for HOTP (no countdown shown). */
	remaining?: number;
	/** Base64 data URL of the logo image stored in settings. */
	logoData?: string;
	/** Font family string. Defaults to Liberation Sans. */
	fontFamily?: string;
};

const BTN = 72; // Stream Deck key button pixel size

function escapeXml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
}

/**
 * Composes a 72×72 SVG button image with:
 *  - OTP code at the top (bold, white)
 *  - Brand logo in the middle (~70 % width)
 *  - Countdown timer at the bottom (TOTP only, muted colour)
 *
 * Returns a base64 SVG data URL ready for `setImage()`.
 * Returns `undefined` when there is nothing to render (no token and no logo).
 */
export function renderButton(opts: RenderOptions): string | undefined {
	const { token, remaining, logoData, fontFamily = DEFAULT_FONT } = opts;
	const hasToken = !!token;
	const hasLogo = !!logoData;
	const hasCountdown = hasToken && remaining !== undefined;

	if (!hasToken && !hasLogo) return undefined;

	// ── Layout zones ──────────────────────────────────────────────────────────
	// Token text:  y=1,  dominant-baseline=hanging, font-size=14  → y 1–15
	// Logo image:  y=17, height=44, width=50 centred               → y 17–61
	// Countdown:   y=71, dominant-baseline=auto,    font-size=10   → y 61–71
	//
	// When only token (no logo/countdown): centre the token vertically.
	// When only logo (no token): logo fills the full button.

	const logoFont = `font-family="${escapeXml(fontFamily)}"`;
	const parts: string[] = [];

	if (hasToken) {
		const tokenY = hasLogo ? 1 : hasCountdown ? 1 : Math.round((BTN - 14) / 2);
		parts.push(
			`<text x="36" y="${tokenY}" dominant-baseline="hanging" text-anchor="middle" ` +
				`${logoFont} font-size="14" font-weight="bold" fill="white">${escapeXml(token!)}</text>`,
		);
	}

	if (hasLogo) {
		// Logo occupies the space between token top area and countdown bottom area.
		const logoTop = hasToken ? 17 : 2;
		const logoBottom = hasCountdown ? 61 : BTN - 2;
		const logoH = logoBottom - logoTop;
		const logoW = 50; // ~70 % of 72
		const logoX = Math.round((BTN - logoW) / 2); // centred → 11
		parts.push(
			`<image href="${logoData}" x="${logoX}" y="${logoTop}" width="${logoW}" height="${logoH}" ` +
				`preserveAspectRatio="xMidYMid meet"/>`,
		);
	}

	if (hasCountdown) {
		parts.push(
			`<text x="36" y="71" dominant-baseline="auto" text-anchor="middle" ` +
				`${logoFont} font-size="10" fill="#888888">${remaining}s</text>`,
		);
	}

	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BTN} ${BTN}">` +
		parts.join("") +
		`</svg>`;

	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
