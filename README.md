# Authenticator — Stream Deck Plugin

A Stream Deck plugin for displaying and outputting TOTP and HOTP one-time passwords directly on your buttons — no phone required.

Live 2FA codes are rendered on the button face alongside your service's logo, with a countdown timer so you can see exactly when the token refreshes. Works with any standard authenticator app secret: **Google Authenticator**, **Authy**, **Ente Auth**, **Microsoft Authenticator**, **1Password**, **Bitwarden**, and more.

## Features

- **Live TOTP display** — 2FA token and 30-second countdown update every second on the button
- **HOTP support** — counter-based OTP with optional auto-increment on press
- **SVG-composed button images** — code at top, logo in the middle, countdown at the bottom; precise layout and font control
- **Logo auto-fetch** — enter a domain and click "Load Logo" to pull a brand logo automatically (Logo.dev API → direct favicon → Google fallback)
- **Custom logo upload** — upload any image as the button logo via the file picker
- **Persistent logos** — logos are stored in per-button settings and survive navigation, restarts, and profile switches
- **Output options** — copy to clipboard or simulate keyboard typing
- **Plugin Settings** — configure a Logo.dev API key and font family once; applies to all buttons

## Requirements

- **Stream Deck app** 7.1 or later
- **macOS** 12+ or **Windows** 10+
- No Python, no runtime dependencies — fully self-contained

## Installation

1. Download `com.cypher-phunk.otp.streamDeckPlugin` from the [Releases](../../releases) page
2. Double-click the downloaded file — Stream Deck will prompt you to install it
3. If the **OTP** category doesn't appear in the action list, restart the Stream Deck app

## Setting up a TOTP button

1. Open the Stream Deck app
2. In the action list on the right, locate the **OTP** category
3. Drag the **TOTP** action onto any button
4. Click the button in the app to open its settings panel
5. Paste your **Base32 TOTP secret** into the **Secret** field
   - When setting up 2FA on a service, look for _"Can't scan the QR code? Enter code manually"_ — that is your Base32 secret
   - Example format: `JBSWY3DPEHPK3PXP`
   - **Ente Auth** — tap the entry → three-dot menu → "Show QR code" → switch to text view for the raw secret
   - **Authy** — backup/export is not built in; export your secrets using a migration tool before adding them here
   - **Google Authenticator** — use Transfer Accounts export or a backup tool to retrieve the Base32 secret
6. Choose an **Output** mode:
   - **Clipboard** — copies the current token to your clipboard when you press the button (recommended)
   - **Type** — simulates keypresses to type the token into the focused field
7. (Optional) Enter the service's domain in **Website** (e.g. `github.com`) and click **Load Logo** to fetch and save the brand icon onto the button
8. Press the button on your Stream Deck — the current OTP is delivered immediately

The button will display the live token and a countdown timer at all times, updating every second automatically.

## Setting up an HOTP button

1. Drag the **HOTP** action onto a button
2. Enter your **Secret** (Base32 format)
3. Set **Initial count** to the current counter value for your account (usually `0`)
4. Enable **Auto increase** if you want the counter to advance automatically after each press
5. Choose an **Output** mode (Clipboard or Type)
6. Optionally load a logo the same way as TOTP

The button displays the token for the current counter. Press the button to output it; the counter increments if Auto increase is on.

## Logo loading

**Auto-fetch:**
1. Enter the service's domain in the **Website** field (e.g. `github.com`)
2. Click **Load Logo** — the plugin fetches the best available logo and saves it to the button

Fetch priority: [Logo.dev](https://logo.dev) (if an API key is configured) → `favicon.ico` from the domain → Google favicon API.

**Custom upload:**
Click **Upload custom…** under the logo section to select any image from your computer. The image is saved directly to the button settings.

**Clearing the logo:**
Click **Clear** to remove the logo and revert the button to the default key icon.

## Plugin Settings

A **Plugin Settings** section appears at the bottom of every button's settings panel. Changes here apply across all OTP buttons immediately.

| Setting | Description |
|---|---|
| **Logo.dev key** | API token for [Logo.dev](https://logo.dev) — provides high-quality vector brand logos. Free tier available. |
| **Font** | Font family for the button text (e.g. `Liberation Sans, sans-serif`). Defaults to Liberation Sans. |

## Building from source

```bash
npm install
npm run build   # compiles TypeScript → com.cypher-phunk.otp.sdPlugin/bin/plugin.js
npm run pack    # packages → com.cypher-phunk.otp.streamDeckPlugin
```

Requires Node.js 20+ and the [Elgato Stream Deck CLI](https://github.com/elgatosf/cli) (`npm install -g @elgato/cli`).

