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
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValueOnce(mockFetchResponse({ mimeType: "image/x-icon" })) // favicon.ico → rejected
			.mockResolvedValueOnce(mockFetchResponse({ mimeType: "image/png" })); // Google → accepted

		const result = await fetchLogo("github.com");

		expect(result).toMatch(/^data:image\/png;base64,/);
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("rejects image/vnd.microsoft.icon the same way", async () => {
		vi.spyOn(global, "fetch")
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

	it("tries logo.dev first when an apiKey is provided", async () => {
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValue(mockFetchResponse({ mimeType: "image/png" }));

		await fetchLogo("github.com", "pk_test_key");

		const firstCall = spy.mock.calls[0][0] as string;
		expect(firstCall).toContain("img.logo.dev");
		expect(firstCall).toContain("pk_test_key");
	});

	it("falls back to favicon when logo.dev fails", async () => {
		const spy = vi
			.spyOn(global, "fetch")
			.mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 403 })) // logo.dev fails
			.mockResolvedValueOnce(mockFetchResponse({ mimeType: "image/png" })); // favicon succeeds

		const result = await fetchLogo("github.com", "pk_test_key");
		expect(result).toMatch(/^data:image\/png;base64,/);
		expect(spy).toHaveBeenCalledTimes(2);
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

describe.skipIf(!apiKey)("fetchLogo integration (live network)", () => {
	it("fetches a real logo via logo.dev for github.com", { timeout: 10_000 }, async () => {
		const result = await fetchLogo("github.com", apiKey);
		assertRealLogo(result, "logo.dev");
	});

	it("fetches a real logo via Google fallback for github.com", { timeout: 10_000 }, async () => {
		const result = await fetchLogo("github.com");
		assertRealLogo(result, "Google fallback");
	});

	it("returns null for a made-up domain", { timeout: 10_000 }, async () => {
		const result = await fetchLogo("this-domain-definitely-does-not-exist-xyz-123.com");
		expect(result).toBeNull();
	});
});
