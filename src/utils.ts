import { exec } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";

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
