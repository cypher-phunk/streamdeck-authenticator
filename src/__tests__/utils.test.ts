import { describe, expect, it } from "vitest";
import { resolveOutputType } from "../utils.js";

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
