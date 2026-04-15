import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.test into process.env so integration tests can read API keys.
// Skips silently if the file doesn't exist.
const envFile = resolve(process.cwd(), ".env.test");
if (existsSync(envFile)) {
	for (const line of readFileSync(envFile, "utf8").split("\n")) {
		const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
		if (match) process.env[match[1].trim()] = match[2].trim();
	}
}
