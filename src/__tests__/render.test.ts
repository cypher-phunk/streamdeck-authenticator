import { describe, expect, it } from "vitest";
import { renderButton } from "../render.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function decodeSvg(dataUrl: string): string {
	const b64 = dataUrl.replace("data:image/svg+xml;base64,", "");
	return Buffer.from(b64, "base64").toString("utf-8");
}

const FAKE_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("renderButton", () => {
	it("returns undefined when neither token nor logo is provided", () => {
		expect(renderButton({})).toBeUndefined();
		expect(renderButton({ fontFamily: "Arial" })).toBeUndefined();
	});

	it("returns a base64 SVG data URL when a token is provided", () => {
		const result = renderButton({ token: "123456" });
		expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
	});

	it("returns a base64 SVG data URL when only a logo is provided", () => {
		const result = renderButton({ logoData: FAKE_LOGO });
		expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
	});

	it("produces a valid SVG root element", () => {
		const svg = decodeSvg(renderButton({ token: "123456" })!);
		expect(svg).toMatch(/^<svg /);
		expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
		expect(svg).toMatch(/<\/svg>$/);
	});

	it("includes the token text in the SVG", () => {
		const svg = decodeSvg(renderButton({ token: "654321" })!);
		expect(svg).toContain("654321");
	});

	it("includes the logo image href in the SVG", () => {
		const svg = decodeSvg(renderButton({ logoData: FAKE_LOGO })!);
		expect(svg).toContain(FAKE_LOGO);
	});

	it("includes countdown seconds when remaining is provided alongside a token", () => {
		const svg = decodeSvg(renderButton({ token: "123456", remaining: 15 })!);
		expect(svg).toContain("15s");
	});

	it("does not include a countdown for HOTP (no remaining)", () => {
		const svg = decodeSvg(renderButton({ token: "123456" })!);
		expect(svg).not.toMatch(/\d+s<\/text>/);
	});

	it("renders all three zones when token, logo, and remaining are all provided", () => {
		const svg = decodeSvg(renderButton({ token: "123456", logoData: FAKE_LOGO, remaining: 28 })!);
		expect(svg).toContain("123456");
		expect(svg).toContain(FAKE_LOGO);
		expect(svg).toContain("28s");
	});

	it("escapes XML special characters in the token", () => {
		const svg = decodeSvg(renderButton({ token: "1&2<3>4" })!);
		expect(svg).toContain("1&amp;2&lt;3&gt;4");
		expect(svg).not.toContain("1&2<3");
	});

	it("escapes XML special characters in the font family", () => {
		const svg = decodeSvg(renderButton({ token: "123456", fontFamily: 'Font"Name' })!);
		expect(svg).toContain("Font&quot;Name");
		expect(svg).not.toContain('Font"Name');
	});

	it("uses the provided fontFamily in the SVG", () => {
		const svg = decodeSvg(renderButton({ token: "123456", fontFamily: "Roboto Mono" })!);
		expect(svg).toContain("Roboto Mono");
	});
});
