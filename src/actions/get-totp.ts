import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import type { KeyAction } from "@elgato/streamdeck";
import clipboard from "clipboardy";
import { TOTP, Secret } from "otpauth";
import { applyEncryptionPreference, decryptSecret } from "../encryption.js";
import { fetchLogo } from "../logo.js";
import { GlobalSettings, getGlobalSettings, onGlobalSettingsChanged } from "../globals.js";
import { renderButton } from "../render.js";
import { resolveOutputType, typeText } from "../utils.js";

type TotpSettings = {
	secret?: string;
	output?: string | [string[], string | null];
	website?: string;
	logoData?: string;
};

@action({ UUID: "com.cypher-phunk.otp.gettotp" })
export class GetTOTP extends SingletonAction<TotpSettings> {
	/** Per-instance 1-second refresh timers keyed by action context ID. */
	private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
	/** Stored action references used by the timer callbacks. */
	private readonly buttonActions = new Map<string, KeyAction<TotpSettings>>();
	/** Cached settings per action (needed by timer callbacks and global-settings listener). */
	private readonly settingsCache = new Map<string, TotpSettings>();

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

	override async onWillAppear(ev: WillAppearEvent<TotpSettings>): Promise<void> {
		const keyAction = ev.action as KeyAction<TotpSettings>;
		// Set buttonActions first so onDidReceiveSettings (triggered by setSettings below) can find it.
		this.buttonActions.set(ev.action.id, keyAction);

		const { encryptSecrets } = getGlobalSettings();
		const updated = applyEncryptionPreference(ev.payload.settings, encryptSecrets ?? false);
		if (updated) {
			await keyAction.setSettings(updated);
			// onDidReceiveSettings will populate settingsCache and start the timer.
			return;
		}

		this.settingsCache.set(ev.action.id, ev.payload.settings);
		this.startTimer(ev.action.id, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<TotpSettings>): void {
		this.stopTimer(ev.action.id);
		this.buttonActions.delete(ev.action.id);
		this.settingsCache.delete(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<TotpSettings>): Promise<void> {
		const keyAction = ev.action as KeyAction<TotpSettings>;
		const { encryptSecrets } = getGlobalSettings();
		const updated = applyEncryptionPreference(ev.payload.settings, encryptSecrets ?? false);
		if (updated) {
			await keyAction.setSettings(updated);
			// onDidReceiveSettings will fire again once the migration is persisted.
			return;
		}

		this.stopTimer(ev.action.id);
		this.buttonActions.set(ev.action.id, keyAction);
		this.settingsCache.set(ev.action.id, ev.payload.settings);
		this.startTimer(ev.action.id, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<TotpSettings>): Promise<void> {
		const { secret: rawSecret, output } = ev.payload.settings;
		const outputType = resolveOutputType(output);
		const secret = rawSecret ? decryptSecret(rawSecret) : null;

		if (!secret || !outputType) {
			await ev.action.showAlert();
			return;
		}

		let token: string;
		try {
			const totp = new TOTP({ secret: Secret.fromBase32(secret) });
			token = totp.generate();
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

		await ev.action.showOk();
	}

	override async onSendToPlugin(ev: SendToPluginEvent<{ type: string; website?: string }, TotpSettings>): Promise<void> {
		if (ev.payload.type !== "loadLogo") return;

		const keyAction = ev.action as KeyAction<TotpSettings>;
		const currentSettings = this.settingsCache.get(ev.action.id) ?? {};
		const website = ev.payload.website ?? currentSettings.website;
		if (!website) return;

		const { logoDevApiKey } = getGlobalSettings();
		const logoData = await fetchLogo(website, logoDevApiKey);
		if (!logoData) {
			await streamDeck.ui.sendToPropertyInspector({ type: "logoFailed" });
			return;
		}

		const newSettings: TotpSettings = { ...currentSettings, logoData };
		await keyAction.setSettings(newSettings);
		await streamDeck.ui.sendToPropertyInspector({ type: "logoLoaded" });
		// onDidReceiveSettings will fire and restart the timer with the updated settings.
	}

	// ── Timer management ──────────────────────────────────────────────────────

	private startTimer(actionId: string, settings: TotpSettings): void {
		const tick = async () => {
			const keyAction = this.buttonActions.get(actionId);
			if (!keyAction) return;
			await this.refreshDisplay(keyAction, settings);
		};

		tick();
		this.timers.set(actionId, setInterval(tick, 1000));
	}

	private stopTimer(actionId: string): void {
		const timer = this.timers.get(actionId);
		if (timer !== undefined) {
			clearInterval(timer);
			this.timers.delete(actionId);
		}
	}

	// ── Display ───────────────────────────────────────────────────────────────

	private async refreshDisplay(keyAction: KeyAction<TotpSettings>, settings: TotpSettings): Promise<void> {
		const { secret: rawSecret, logoData } = settings;
		const secret = rawSecret ? decryptSecret(rawSecret) : null;
		const { fontFamily } = getGlobalSettings();

		if (!secret) {
			const image = renderButton({ logoData, fontFamily });
			if (image) {
				await keyAction.setImage(image);
			} else {
				await keyAction.setImage();
			}
			return;
		}

		try {
			const totp = new TOTP({ secret: Secret.fromBase32(secret) });
			const token = totp.generate();
			const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
			const image = renderButton({ token, remaining, logoData, fontFamily });
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
