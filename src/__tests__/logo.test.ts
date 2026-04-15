import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLogo } from "../logo.js";

// ── Mock helpers ────────────────────────────────────────────────────────────

function mockFetchResponse(opts: {
	ok?: boolean;
	status?: number;
	byteLength?: number;
	mimeType?: string;
}) {
	const { ok = true, status = 200, byteLength = 500, mimeType = "image/png" } = opts;
	return {
		ok,
		status,
		headers: { get: (key: string) => (key === "content-type" ? mimeType : null) },
		arrayBuffer: async () => new ArrayBuffer(byteLength),
	} as unknown as Response;
}

// ── Unit tests (fetch is mocked) ────────────────────────────────────────────

describe("fetchLogo (unit)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("returns null for an empty website", async () => {
		expect(await fetchLogo("")).toBeNull();
	});

	it("returns null for a whitespace-only website", async () => {
		expect(await fetchLogo("   ")).toBeNull();
	});

	it("strips protocol and path when building fetch URLs", async () => {
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValue(mockFetchResponse({ ok: false, status: 404 }));

		await fetchLogo("https://github.com/login/oauth");

		// Should use just the domain, not the full URL
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("github.com"), expect.anything());
		expect(spy).not.toHaveBeenCalledWith(
			expect.stringContaining("/login/oauth"),
			expect.anything(),
		);
	});

	it("rejects image/x-icon and falls through to the next source", async () => {
		// Simple Icons fails → favicon.ico returns x-icon (rejected) → Google returns png (accepted)
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValueOnce(mockFetchResponse({ ok: false })) // Simple Icons fails
			.mockResolvedValueOnce(mockFetchResponse({ mimeType: "image/x-icon" })) // favicon.ico → rejected
			.mockResolvedValueOnce(mockFetchResponse({ mimeType: "image/png" })); // Google → accepted

		const result = await fetchLogo("github.com");

		expect(result).toMatch(/^data:image\/png;base64,/);
		expect(spy).toHaveBeenCalledTimes(3);
	});

	it("rejects image/vnd.microsoft.icon the same way", async () => {
		vi.spyOn(global, "fetch")
			.mockResolvedValueOnce(mockFetchResponse({ ok: false })) // Simple Icons fails
			.mockResolvedValueOnce(mockFetchResponse({ mimeType: "image/vnd.microsoft.icon" }))
			.mockResolvedValueOnce(mockFetchResponse({ mimeType: "image/png" }));

		const result = await fetchLogo("example.com");
		expect(result).toMatch(/^data:image\/png;base64,/);
	});

	it("accepts image/png, image/jpeg, image/gif, image/webp, image/svg+xml", async () => {
		for (const mimeType of ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]) {
			vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse({ mimeType }));
			const result = await fetchLogo("example.com");
			expect(result, `should accept ${mimeType}`).toMatch(new RegExp(`^data:${mimeType.replace("+", "\\+")};base64,`));
			vi.restoreAllMocks();
		}
	});

	it("returns null when response is not ok", async () => {
		vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse({ ok: false, status: 404 }));
		expect(await fetchLogo("github.com")).toBeNull();
	});

	it("returns null for tiny responses (< 64 bytes)", async () => {
		vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse({ byteLength: 32 }));
		expect(await fetchLogo("github.com")).toBeNull();
	});

	it("returns null when all sources fail", async () => {
		vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse({ ok: false, status: 404 }));
		expect(await fetchLogo("nonexistent-fake-domain-xyz.com")).toBeNull();
	});

	it("returns a valid data URL on a successful fetch", async () => {
		vi.spyOn(global, "fetch").mockResolvedValue(mockFetchResponse({ mimeType: "image/png", byteLength: 200 }));
		const result = await fetchLogo("example.com");
		expect(result).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
	});

	// ── Source: auto ─────────────────────────────────────────────────────────

	it("tries Simple Icons first in auto mode", async () => {
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValue(mockFetchResponse({ mimeType: "image/svg+xml" }));

		await fetchLogo("github.com");

		const firstUrl = spy.mock.calls[0][0] as string;
		expect(firstUrl).toContain("cdn.simpleicons.org");
		expect(firstUrl).toContain("github");
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("tries logo.dev second in auto mode when an apiKey is provided and Simple Icons fails", async () => {
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 404 })) // Simple Icons fails
			.mockResolvedValue(mockFetchResponse({ mimeType: "image/png" })); // logo.dev succeeds

		await fetchLogo("github.com", { apiKey: "pk_test_key" });

		const urls = spy.mock.calls.map((c) => c[0] as string);
		expect(urls[0]).toContain("cdn.simpleicons.org");
		expect(urls[1]).toContain("img.logo.dev");
		expect(urls[1]).toContain("pk_test_key");
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("falls back to favicon when Simple Icons and logo.dev both fail", async () => {
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 404 })) // Simple Icons fails
			.mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 403 })) // logo.dev fails
			.mockResolvedValueOnce(mockFetchResponse({ mimeType: "image/png" })); // favicon succeeds

		const result = await fetchLogo("github.com", { apiKey: "pk_test_key" });
		expect(result).toMatch(/^data:image\/png;base64,/);
		expect(spy).toHaveBeenCalledTimes(3);
	});

	it("appends the color to the Simple Icons URL when provided", async () => {
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValue(mockFetchResponse({ mimeType: "image/svg+xml" }));

		await fetchLogo("github.com", { color: "ffffff" });

		const firstUrl = spy.mock.calls[0][0] as string;
		expect(firstUrl).toContain("cdn.simpleicons.org");
		expect(firstUrl).toContain("/ffffff");
	});

	// ── Source: simpleicons ───────────────────────────────────────────────────

	it("only calls Simple Icons CDN when source is 'simpleicons' and it succeeds", async () => {
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValue(mockFetchResponse({ mimeType: "image/svg+xml" }));

		const result = await fetchLogo("github.com", { source: "simpleicons" });

		expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][0] as string).toContain("cdn.simpleicons.org");
	});

	it("falls back to favicon when source is 'simpleicons' and CDN returns nothing", async () => {
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 404 })) // Simple Icons fails
			.mockResolvedValueOnce(mockFetchResponse({ mimeType: "image/png" })); // favicon succeeds

		const result = await fetchLogo("github.com", { source: "simpleicons" });

		expect(result).toMatch(/^data:image\/png;base64,/);
		// Should NOT call logo.dev even if an apiKey was supplied
		const urls = spy.mock.calls.map((c) => c[0] as string);
		expect(urls.every((u) => !u.includes("img.logo.dev"))).toBe(true);
	});

	// ── Source: logodev ───────────────────────────────────────────────────────

	it("only calls logo.dev when source is 'logodev' and apiKey is provided", async () => {
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValue(mockFetchResponse({ mimeType: "image/png" }));

		const result = await fetchLogo("github.com", { source: "logodev", apiKey: "pk_test_key" });

		expect(result).toMatch(/^data:image\/png;base64,/);
		expect(spy).toHaveBeenCalledTimes(1);
		const firstUrl = spy.mock.calls[0][0] as string;
		expect(firstUrl).toContain("img.logo.dev");
		expect(firstUrl).toContain("pk_test_key");
		// Should NOT call Simple Icons
		expect(firstUrl).not.toContain("cdn.simpleicons.org");
	});

	it("falls back to favicon when source is 'logodev' and logo.dev fails", async () => {
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 403 })) // logo.dev fails
			.mockResolvedValueOnce(mockFetchResponse({ mimeType: "image/png" })); // favicon succeeds

		const result = await fetchLogo("github.com", { source: "logodev", apiKey: "pk_test_key" });
		expect(result).toMatch(/^data:image\/png;base64,/);
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("skips logo.dev entirely when source is 'logodev' but no apiKey is provided", async () => {
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValue(mockFetchResponse({ mimeType: "image/png" }));

		await fetchLogo("github.com", { source: "logodev" });

		const urls = spy.mock.calls.map((c) => c[0] as string);
		expect(urls.every((u) => !u.includes("img.logo.dev"))).toBe(true);
	});

	it("handles fetch throwing (network error) gracefully", async () => {
		vi.spyOn(global, "fetch").mockRejectedValue(new Error("network error"));
		expect(await fetchLogo("github.com")).toBeNull();
	});
});

// ── Integration tests (real network, requires LOGO_DEV_API_KEY) ─────────────

const apiKey = process.env.LOGO_DEV_API_KEY;

function assertRealLogo(result: string | null, source: string) {
	// 1. Must not be null
	expect(result, `${source}: expected a logo but got null`).not.toBeNull();

	// 2. Must be a valid SVG-safe image data URL
	expect(result!, `${source}: wrong data URL format`).toMatch(
		/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/,
	);

	// 3. Extract and decode the base64 payload — must be a real image (> 64 bytes)
	const b64 = result!.replace(/^data:[^;]+;base64,/, "");
	const bytes = Buffer.from(b64, "base64").byteLength;
	expect(bytes, `${source}: image payload too small (${bytes} bytes) — likely a placeholder or empty response`).toBeGreaterThan(64);
}

describe("fetchLogo integration (live network, Simple Icons)", () => {
	it("fetches a real SVG for github.com via Simple Icons", { timeout: 10_000 }, async () => {
		const result = await fetchLogo("github.com", { source: "simpleicons" });
		assertRealLogo(result, "Simple Icons");
		expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
	});

	it("fetches a colored SVG for github.com via Simple Icons", { timeout: 10_000 }, async () => {
		const result = await fetchLogo("github.com", { source: "simpleicons", color: "ffffff" });
		assertRealLogo(result, "Simple Icons (colored)");
	});

	it("returns null for a made-up domain", { timeout: 10_000 }, async () => {
		const result = await fetchLogo("this-domain-definitely-does-not-exist-xyz-123.com");
		expect(result).toBeNull();
	});
});

describe.skipIf(!apiKey)("fetchLogo integration (live network, logo.dev)", () => {
	it("fetches a real logo via logo.dev for github.com", { timeout: 10_000 }, async () => {
		const result = await fetchLogo("github.com", { source: "logodev", apiKey });
		assertRealLogo(result, "logo.dev");
	});

	it("fetches a real logo via Google fallback for github.com", { timeout: 10_000 }, async () => {
		const result = await fetchLogo("github.com");
		assertRealLogo(result, "Google fallback");
	});
});
