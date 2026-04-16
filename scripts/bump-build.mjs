/**
 * Increments the build segment (4th number) in manifest.json before each pack.
 * The first three segments (major.minor.patch) are always synced from package.json.
 * Outputs the new full version string to stdout so the pack script can use it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const manifestPath = resolve(root, "com.cypher-phunk.otp.sdPlugin/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const [major, minor, patch] = pkg.version.split(".");
const build = parseInt(manifest.Version.split(".")[3] ?? "0", 10);

manifest.Version = `${major}.${minor}.${patch}.${build + 1}`;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
process.stdout.write(manifest.Version);
