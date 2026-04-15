import { exec } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";
import { TOTP, URI } from "otpauth";

const execAsync = promisify(exec);

export function resolveOutputType(output: string | [string[], string | null] | undefined): string | null {
	if (Array.isArray(output)) return output[1] ?? null;
	return output ?? null;
}

export async function typeText(text: string): Promise<void> {
	const os = platform();
	if (os === "darwin") {
		await execAsync(`osascript -e 'tell application "System Events" to keystroke "${text}"'`);
	} else if (os === "win32") {
		await execAsync(
			`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${text}')"`,
		);
	} else {
		throw new Error(`Unsupported platform for keyboard typing: ${os}`);
	}
}

/**
 * Parses an otpauth:// URI into its component fields.
 *
 * Only non-default values are returned for digits/period/algorithm so that
 * callers can spread the result into settings without overriding the otpauth
 * library's own defaults for standard configurations.
 *
 * Returns null for malformed or unsupported URIs.
 */
export function parseOtpauthUri(uri: string): {
	type: "totp" | "hotp";
	secret: string;
	issuer?: string;
	digits?: number;
	period?: number;
	algorithm?: string;
} | null {
	try {
		const otp = URI.parse(uri.trim());
		return {
			type: otp instanceof TOTP ? "totp" : "hotp",
			secret: otp.secret.base32,
			issuer: otp.issuer || undefined,
			digits: otp.digits !== 6 ? otp.digits : undefined,
			period: "period" in otp && (otp as TOTP).period !== 30 ? (otp as TOTP).period : undefined,
			algorithm: otp.algorithm !== "SHA1" ? otp.algorithm : undefined,
		};
	} catch {
		return null;
	}
}
