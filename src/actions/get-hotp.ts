import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
} from "@elgato/streamdeck";
import type { KeyAction } from "@elgato/streamdeck";
import clipboard from "clipboardy";
import { HOTP, Secret } from "otpauth";
import { applyEncryptionPreference, decryptSecret } from "../encryption.js";
import { fetchLogo, LogoSource } from "../logo.js";
import { GlobalSettings, getGlobalSettings, onGlobalSettingsChanged, whenGlobalSettingsReady } from "../globals.js";
import { renderButton } from "../render.js";
import { resolveOutputType, typeText } from "../utils.js";

type HotpSettings = {
	secret?: string;
	initial_count?: string;
	auto_increase?: boolean;
	output?: string | [string[], string | null];
	website?: string;
	logoData?: string;
	logoSource?: LogoSource;
	logoColor?: string;
};

@action({ UUID: "com.cypher-phunk.otp.gethotp" })
export class GetHOTP extends SingletonAction<HotpSettings> {
	/** Stored action references keyed by action ID for global-settings re-render. */
	private readonly buttonActions = new Map<string, KeyAction<HotpSettings>>();
	/** Cached settings per action, needed by the global-settings listener. */
	private readonly settingsCache = new Map<string, HotpSettings>();

	constructor() {
		super();
		onGlobalSettingsChanged((globalSettings: GlobalSettings) => {
			for (const [id, keyAction] of this.buttonActions) {
				const settings = this.settingsCache.get(id) ?? {};
				const updated = applyEncryptionPreference(settings, globalSettings.encryptSecrets ?? false);
				if (updated) {
					// Encryption preference changed — migrate the stored secret.
					// onDidReceiveSettings will fire and refresh the display.
					void keyAction.setSettings(updated);
				} else {
					void this.refreshDisplay(keyAction, settings);
				}
			}
		});
	}

	override async onWillAppear(ev: WillAppearEvent<HotpSettings>): Promise<void> {
		const keyAction = ev.action as KeyAction<HotpSettings>;
		this.buttonActions.set(ev.action.id, keyAction);
		// Populate cache immediately so onSendToPlugin (loadLogo) always has current settings,
		// even during the brief window while an encryption migration is in flight.
		this.settingsCache.set(ev.action.id, ev.payload.settings);

		// Render the button immediately so the user sees something right away.
		await this.refreshDisplay(keyAction, ev.payload.settings);

		// Wait for the first getGlobalSettings response before running migration.
		// Without this, onWillAppear can fire before encryptSecrets is known,
		// causing already-encrypted secrets to be decrypted to plaintext on disk.
		await whenGlobalSettingsReady();

		const { encryptSecrets } = getGlobalSettings();
		const updated = applyEncryptionPreference(ev.payload.settings, encryptSecrets ?? false);
		if (updated) {
			await keyAction.setSettings(updated);
			// onDidReceiveSettings will update settingsCache and refresh the display.
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<HotpSettings>): Promise<void> {
		const keyAction = ev.action as KeyAction<HotpSettings>;
		const { encryptSecrets } = getGlobalSettings();
		const updated = applyEncryptionPreference(ev.payload.settings, encryptSecrets ?? false);
		if (updated) {
			// Keep cache current (pre-migration) so loadLogo can't wipe the secret
			// in the window before the second onDidReceiveSettings fires.
			this.settingsCache.set(ev.action.id, ev.payload.settings);
			await keyAction.setSettings(updated);
			// onDidReceiveSettings will fire again once the migration is persisted.
			return;
		}

		this.buttonActions.set(ev.action.id, keyAction);
		this.settingsCache.set(ev.action.id, ev.payload.settings);
		await this.refreshDisplay(keyAction, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<HotpSettings>): Promise<void> {
		const { secret: rawSecret, initial_count, auto_increase, output } = ev.payload.settings;
		const outputType = resolveOutputType(output);
		const secret = rawSecret ? decryptSecret(rawSecret) : null;

		if (!secret || initial_count === undefined || initial_count === "" || !outputType) {
			await ev.action.showAlert();
			return;
		}

		const count = parseInt(initial_count, 10);
		if (isNaN(count)) {
			await ev.action.showAlert();
			return;
		}

		let token: string;
		try {
			const hotp = new HOTP({ secret: Secret.fromBase32(secret) });
			token = hotp.generate({ counter: count });
		} catch {
			await ev.action.showAlert();
			return;
		}

		try {
			if (outputType === "Type") {
				await typeText(token);
			} else if (outputType === "Clipboard") {
				await clipboard.write(token);
			} else {
				await ev.action.showAlert();
				return;
			}
		} catch {
			await ev.action.showAlert();
			return;
		}

		const newCount = auto_increase ? count + 1 : count;
		const newSettings: HotpSettings = { ...ev.payload.settings, initial_count: String(newCount) };

		if (auto_increase) {
			await ev.action.setSettings(newSettings);
		}

		await this.refreshDisplay(ev.action as KeyAction<HotpSettings>, newSettings);
		await ev.action.showOk();
	}

	override async onSendToPlugin(ev: SendToPluginEvent<{ type: string; website?: string; source?: string; color?: string }, HotpSettings>): Promise<void> {
		if (ev.payload.type !== "loadLogo") return;

		const keyAction = ev.action as KeyAction<HotpSettings>;
		const currentSettings = this.settingsCache.get(ev.action.id) ?? {};
		const website = ev.payload.website ?? currentSettings.website;
		if (!website) return;

		const { logoDevApiKey } = getGlobalSettings();
		const source = (ev.payload.source || currentSettings.logoSource) as LogoSource | undefined;
		const color = ev.payload.color ?? currentSettings.logoColor;
		const logoData = await fetchLogo(website, { apiKey: logoDevApiKey, source, color });
		if (!logoData) {
			await streamDeck.ui.sendToPropertyInspector({ type: "logoFailed" });
			return;
		}

		const newSettings: HotpSettings = { ...currentSettings, logoData };
		// Update cache directly so refreshDisplay below uses the new logo immediately.
		this.settingsCache.set(ev.action.id, newSettings);
		await keyAction.setSettings(newSettings);
		// Refresh immediately — don't wait for onDidReceiveSettings.
		await this.refreshDisplay(keyAction, newSettings);
		await streamDeck.ui.sendToPropertyInspector({ type: "logoLoaded" });
	}

	// ── Display ───────────────────────────────────────────────────────────────

	private async refreshDisplay(keyAction: KeyAction<HotpSettings>, settings: HotpSettings): Promise<void> {
		const { secret: rawSecret, initial_count, logoData } = settings;
		const secret = rawSecret ? decryptSecret(rawSecret) : null;
		const { fontFamily } = getGlobalSettings();

		if (!secret || initial_count === undefined || initial_count === "") {
			const image = renderButton({ logoData, fontFamily });
			if (image) {
				await keyAction.setImage(image);
			} else {
				await keyAction.setImage();
			}
			return;
		}

		const count = parseInt(initial_count, 10);
		if (isNaN(count)) {
			await keyAction.setImage();
			return;
		}

		try {
			const hotp = new HOTP({ secret: Secret.fromBase32(secret) });
			const token = hotp.generate({ counter: count });
			const image = renderButton({ token, logoData, fontFamily });
			if (image) {
				await keyAction.setImage(image);
			} else {
				await keyAction.setImage();
			}
		} catch {
			await keyAction.setImage();
		}
	}
}
