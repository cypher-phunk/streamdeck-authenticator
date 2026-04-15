import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { hostname, userInfo } from "node:os";

const ENCRYPTED_PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const PLUGIN_SALT = "com.cypher-phunk.otp.secret.v1";

/**
 * Derives a 256-bit encryption key from the current machine's hostname and
 * username. The key is consistent across plugin restarts on the same machine
 * but will differ on any other machine, preventing secrets from being used if
 * a Stream Deck profile is copied elsewhere.
 */
function deriveKey(): Buffer {
	const material = `${userInfo().username}@${hostname()}`;
	return scryptSync(material, PLUGIN_SALT, 32);
}

/**
 * Encrypts a plaintext OTP secret using AES-256-GCM.
 * Returns a prefixed base64 string safe to store in Stream Deck settings.
 */
export function encryptSecret(plaintext: string): string {
	const key = deriveKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	// Layout: iv (12 bytes) | auth tag (16 bytes) | ciphertext
	return ENCRYPTED_PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypts a secret that was encrypted with encryptSecret.
 * Returns the plaintext, or null if decryption fails (wrong machine, corrupted data).
 * Passes plaintext values through unchanged so callers don't need to branch.
 */
export function decryptSecret(value: string): string | null {
	if (!isEncrypted(value)) return value;
	try {
		const key = deriveKey();
		const data = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), "base64");
		const iv = data.subarray(0, 12);
		const tag = data.subarray(12, 28);
		const ciphertext = data.subarray(28);
		const decipher = createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(tag);
		return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
	} catch {
		return null;
	}
}

/**
 * Returns true if the value was produced by encryptSecret.
 */
export function isEncrypted(value: string): boolean {
	return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Applies the user's encryption preference to a settings object that contains a `secret` field.
 *
 * - If `shouldEncrypt` is true and the secret is plaintext → returns a new settings object
 *   with the secret encrypted.
 * - If `shouldEncrypt` is false and the secret is encrypted → returns a new settings object
 *   with the secret decrypted.
 * - If no migration is needed (already in the desired state, or no secret) → returns null.
 *
 * Callers should persist the returned settings via `setSettings` when non-null.
 */
export function applyEncryptionPreference<T extends { secret?: string }>(
	settings: T,
	shouldEncrypt: boolean,
): T | null {
	const { secret } = settings;
	if (!secret) return null;

	if (shouldEncrypt && !isEncrypted(secret)) {
		return { ...settings, secret: encryptSecret(secret) };
	}

	if (!shouldEncrypt && isEncrypted(secret)) {
		const decrypted = decryptSecret(secret);
		if (decrypted !== null) return { ...settings, secret: decrypted };
	}

	return null;
}
