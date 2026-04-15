import { describe, expect, it } from "vitest";
import { parseOtpauthUri, resolveOutputType } from "../utils.js";

describe("resolveOutputType", () => {
	it("returns the string directly for a plain string value", () => {
		expect(resolveOutputType("Clipboard")).toBe("Clipboard");
		expect(resolveOutputType("Type")).toBe("Type");
	});

	it("returns null for undefined", () => {
		expect(resolveOutputType(undefined)).toBeNull();
	});

	it("returns the second element when given a [choices, selected] tuple", () => {
		expect(resolveOutputType([["Clipboard", "Type"], "Clipboard"])).toBe("Clipboard");
		expect(resolveOutputType([["Clipboard", "Type"], "Type"])).toBe("Type");
	});

	it("returns null when the selected value in the tuple is null", () => {
		expect(resolveOutputType([["Clipboard", "Type"], null])).toBeNull();
	});

	it("returns an empty string directly (no coercion to null)", () => {
		// Empty string means the user hasn't selected yet; callers handle the null-check
		expect(resolveOutputType("")).toBe("");
	});
});

describe("parseOtpauthUri", () => {
	const BASE_URI = "otpauth://totp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example";

	it("parses a standard TOTP URI and returns undefined for default params", () => {
		const result = parseOtpauthUri(BASE_URI);
		expect(result).not.toBeNull();
		expect(result!.type).toBe("totp");
		expect(result!.secret).toBe("JBSWY3DPEHPK3PXP");
		expect(result!.issuer).toBe("Example");
		// Default values should be omitted so callers don't override library defaults
		expect(result!.digits).toBeUndefined();
		expect(result!.period).toBeUndefined();
		expect(result!.algorithm).toBeUndefined();
	});

	it("returns digits when non-standard (8)", () => {
		const result = parseOtpauthUri(`${BASE_URI}&digits=8`);
		expect(result!.digits).toBe(8);
	});

	it("returns period when non-standard (60s)", () => {
		const result = parseOtpauthUri(`${BASE_URI}&period=60`);
		expect(result!.period).toBe(60);
	});

	it("returns algorithm when non-standard (SHA256)", () => {
		const result = parseOtpauthUri(`${BASE_URI}&algorithm=SHA256`);
		expect(result!.algorithm).toBe("SHA256");
	});

	it("returns all non-standard params together", () => {
		const result = parseOtpauthUri(
			"otpauth://totp/Acme:user@acme.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme&digits=8&period=60&algorithm=SHA256",
		);
		expect(result!.digits).toBe(8);
		expect(result!.period).toBe(60);
		expect(result!.algorithm).toBe("SHA256");
	});

	it("returns type: hotp for an HOTP URI", () => {
		const result = parseOtpauthUri(
			"otpauth://hotp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&counter=0",
		);
		expect(result).not.toBeNull();
		expect(result!.type).toBe("hotp");
	});

	it("returns null for a malformed URI", () => {
		expect(parseOtpauthUri("not-a-uri")).toBeNull();
		expect(parseOtpauthUri("otpauth://totp/")).toBeNull();
		expect(parseOtpauthUri("https://example.com")).toBeNull();
	});

	it("returns null for an empty string", () => {
		expect(parseOtpauthUri("")).toBeNull();
	});

	it("trims leading/trailing whitespace before parsing", () => {
		const result = parseOtpauthUri(`  ${BASE_URI}  `);
		expect(result).not.toBeNull();
		expect(result!.secret).toBe("JBSWY3DPEHPK3PXP");
	});

	it("handles a URI with no issuer", () => {
		const result = parseOtpauthUri(
			"otpauth://totp/user@example.com?secret=JBSWY3DPEHPK3PXP",
		);
		expect(result).not.toBeNull();
		expect(result!.issuer).toBeUndefined();
	});
});
