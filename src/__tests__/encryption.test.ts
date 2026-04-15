import { describe, expect, it } from "vitest";
import { applyEncryptionPreference, decryptSecret, encryptSecret, isEncrypted } from "../encryption.js";

describe("isEncrypted", () => {
	it("returns false for a plaintext base32 secret", () => {
		expect(isEncrypted("JBSWY3DPEHPK3PXP")).toBe(false);
	});

	it("returns false for an empty string", () => {
		expect(isEncrypted("")).toBe(false);
	});

	it("returns true for a value produced by encryptSecret", () => {
		expect(isEncrypted(encryptSecret("JBSWY3DPEHPK3PXP"))).toBe(true);
	});

	it("returns true for the enc:v1: prefix", () => {
		expect(isEncrypted("enc:v1:anything")).toBe(true);
	});
});

describe("encryptSecret", () => {
	it("produces a string starting with enc:v1:", () => {
		expect(encryptSecret("JBSWY3DPEHPK3PXP")).toMatch(/^enc:v1:/);
	});

	it("produces different ciphertext each call (random IV)", () => {
		const a = encryptSecret("JBSWY3DPEHPK3PXP");
		const b = encryptSecret("JBSWY3DPEHPK3PXP");
		expect(a).not.toBe(b);
	});

	it("does not contain the plaintext in the output", () => {
		const result = encryptSecret("JBSWY3DPEHPK3PXP");
		expect(result).not.toContain("JBSWY3DPEHPK3PXP");
	});
});

describe("decryptSecret", () => {
	it("round-trips a standard base32 TOTP secret", () => {
		const plaintext = "JBSWY3DPEHPK3PXP";
		expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
	});

	it("round-trips a long secret", () => {
		const plaintext = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
		expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
	});

	it("round-trips a secret with mixed case and padding", () => {
		const plaintext = "NB2HI4DTHIXS653XO4XHS33VOR4XAZLTOQQGK3TF5RW63I=";
		expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
	});

	it("passes plaintext through unchanged (no double-encryption)", () => {
		expect(decryptSecret("JBSWY3DPEHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
	});

	it("returns null for a truncated ciphertext", () => {
		const encrypted = encryptSecret("JBSWY3DPEHPK3PXP");
		const truncated = encrypted.slice(0, encrypted.length - 10);
		expect(decryptSecret(truncated)).toBeNull();
	});

	it("returns null for a tampered ciphertext", () => {
		const encrypted = encryptSecret("JBSWY3DPEHPK3PXP");
		// Flip a byte in the middle of the base64 payload
		const chars = encrypted.split("");
		const mid = Math.floor(chars.length / 2);
		chars[mid] = chars[mid] === "A" ? "B" : "A";
		expect(decryptSecret(chars.join(""))).toBeNull();
	});

	it("returns null for a completely invalid ciphertext string", () => {
		expect(decryptSecret("enc:v1:notvalidbase64!!!")).toBeNull();
	});
});

describe("applyEncryptionPreference", () => {
	it("encrypts a plaintext secret when shouldEncrypt is true", () => {
		const settings = { secret: "JBSWY3DPEHPK3PXP", website: "github.com" };
		const result = applyEncryptionPreference(settings, true);
		expect(result).not.toBeNull();
		expect(result!.secret).toMatch(/^enc:v1:/);
		expect(result!.website).toBe("github.com"); // other fields preserved
	});

	it("decrypts an encrypted secret when shouldEncrypt is false", () => {
		const encrypted = encryptSecret("JBSWY3DPEHPK3PXP");
		const settings = { secret: encrypted };
		const result = applyEncryptionPreference(settings, false);
		expect(result).not.toBeNull();
		expect(result!.secret).toBe("JBSWY3DPEHPK3PXP");
	});

	it("returns null when already encrypted and shouldEncrypt is true (no-op)", () => {
		const settings = { secret: encryptSecret("JBSWY3DPEHPK3PXP") };
		expect(applyEncryptionPreference(settings, true)).toBeNull();
	});

	it("returns null when plaintext and shouldEncrypt is false (no-op)", () => {
		const settings = { secret: "JBSWY3DPEHPK3PXP" };
		expect(applyEncryptionPreference(settings, false)).toBeNull();
	});

	it("returns null when there is no secret", () => {
		expect(applyEncryptionPreference({ website: "github.com" }, true)).toBeNull();
		expect(applyEncryptionPreference({ website: "github.com" }, false)).toBeNull();
		expect(applyEncryptionPreference({}, true)).toBeNull();
	});

	it("preserves all non-secret fields on the returned object", () => {
		const settings = { secret: "JBSWY3DPEHPK3PXP", website: "github.com", logoData: "data:image/png;base64,abc", output: "Clipboard" };
		const result = applyEncryptionPreference(settings, true);
		expect(result!.website).toBe("github.com");
		expect(result!.logoData).toBe("data:image/png;base64,abc");
		expect(result!.output).toBe("Clipboard");
	});

	it("does not mutate the original settings object", () => {
		const settings = { secret: "JBSWY3DPEHPK3PXP" };
		applyEncryptionPreference(settings, true);
		expect(settings.secret).toBe("JBSWY3DPEHPK3PXP");
	});

	it("round-trips: encrypt then decrypt returns original settings", () => {
		const original = { secret: "JBSWY3DPEHPK3PXP", website: "github.com" };
		const encrypted = applyEncryptionPreference(original, true)!;
		const decrypted = applyEncryptionPreference(encrypted, false)!;
		expect(decrypted.secret).toBe(original.secret);
		expect(decrypted.website).toBe(original.website);
	});
});
