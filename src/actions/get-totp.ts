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
import { fetchLogo, LogoSource } from "../logo.js";
import { GlobalSettings, getGlobalSettings, onGlobalSettingsChanged, whenGlobalSettingsReady } from "../globals.js";
import { renderButton } from "../render.js";
import { parseOtpauthUri, resolveOutputType, typeText } from "../utils.js";

type TotpSettings = {
	secret?: string;
	digits?: number;
	period?: number;
	algorithm?: string;
	issuer?: string;
	output?: string | [string[], string | null];
	website?: string;
	logoData?: string;
	logoSource?: LogoSource;
	logoColor?: string;
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
		this.buttonActions.set(ev.action.id, keyAction);
		this.settingsCache.set(ev.action.id, ev.payload.settings);

		// Start the timer immediately so the button renders without delay.
		this.startTimer(ev.action.id);

		// Wait for the first getGlobalSettings response before running migration.
		// Without this, onWillAppear can fire before encryptSecrets is known,
		// causing already-encrypted secrets to be decrypted to plaintext on disk.
		await whenGlobalSettingsReady();

		const { encryptSecrets } = getGlobalSettings();
		const updated = applyEncryptionPreference(ev.payload.settings, encryptSecrets ?? false);
		if (updated) {
			await keyAction.setSettings(updated);
			// onDidReceiveSettings will update settingsCache with the migrated value.
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<TotpSettings>): void {
		this.stopTimer(ev.action.id);
		this.buttonActions.delete(ev.action.id);
		this.settingsCache.delete(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<TotpSettings>): Promise<void> {
		const keyAction = ev.action as KeyAction<TotpSettings>;
		const { encryptSecrets } = getGlobalSettings();

		// Always update cache and action ref first — the timer reads from here.
		this.buttonActions.set(ev.action.id, keyAction);
		this.settingsCache.set(ev.action.id, ev.payload.settings);

		const updated = applyEncryptionPreference(ev.payload.settings, encryptSecrets ?? false);
		if (updated) {
			await keyAction.setSettings(updated);
			// onDidReceiveSettings will fire again once the migration is persisted.
			return;
		}

		// Ensure the timer is running (it may not be if the action was just added).
		if (!this.timers.has(ev.action.id)) {
			this.startTimer(ev.action.id);
		} else {
			// Timer is already running and will pick up the new cache on its next tick,
			// but also refresh immediately so the user sees the code right away.
			await this.refreshDisplay(keyAction, ev.payload.settings);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<TotpSettings>): Promise<void> {
		const { secret: rawSecret, digits, period, algorithm, output } = ev.payload.settings;
		const outputType = resolveOutputType(output);
		const secret = rawSecret ? decryptSecret(rawSecret) : null;

		if (!secret || !outputType) {
			await ev.action.showAlert();
			return;
		}

		let token: string;
		try {
			const totp = new TOTP({
				secret: Secret.fromBase32(secret),
				digits: digits ?? 6,
				period: period ?? 30,
				algorithm: algorithm ?? "SHA1",
			});
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

	override async onSendToPlugin(ev: SendToPluginEvent<{ type: string; website?: string; uri?: string; source?: string; color?: string }, TotpSettings>): Promise<void> {
		if (ev.payload.type === "parseUri") {
			const parsed = parseOtpauthUri(ev.payload.uri ?? "");
			if (!parsed || parsed.type !== "totp") {
				await streamDeck.ui.sendToPropertyInspector({ type: "uriFailed" });
				return;
			}
			const currentSettings = this.settingsCache.get(ev.action.id) ?? {};
			const newSettings: TotpSettings = {
				...currentSettings,
				secret: parsed.secret,
				...(parsed.digits    !== undefined && { digits:    parsed.digits }),
				...(parsed.period    !== undefined && { period:    parsed.period }),
				...(parsed.algorithm !== undefined && { algorithm: parsed.algorithm }),
				...(parsed.issuer    !== undefined && { issuer:    parsed.issuer }),
			};
			// Update cache now so the timer shows the new code before onDidReceiveSettings fires.
			this.settingsCache.set(ev.action.id, newSettings);
			await (ev.action as KeyAction<TotpSettings>).setSettings(newSettings);
			await streamDeck.ui.sendToPropertyInspector({ type: "uriImported", issuer: parsed.issuer });
			// Refresh immediately — onDidReceiveSettings will also fire (and encrypt if needed).
			await this.refreshDisplay(ev.action as KeyAction<TotpSettings>, newSettings);
			return;
		}

		if (ev.payload.type !== "loadLogo") return;

		const keyAction = ev.action as KeyAction<TotpSettings>;
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

		const newSettings: TotpSettings = { ...currentSettings, logoData };
		// Update cache directly so the timer picks up the new logo without waiting for
		// onDidReceiveSettings, and persist to storage.
		this.settingsCache.set(ev.action.id, newSettings);
		await keyAction.setSettings(newSettings);
		// Refresh immediately — don't wait for onDidReceiveSettings or the next timer tick.
		await this.refreshDisplay(keyAction, newSettings);
		await streamDeck.ui.sendToPropertyInspector({ type: "logoLoaded" });
	}

	// ── Timer management ──────────────────────────────────────────────────────

	/**
	 * Starts (or restarts) the 1-second display timer for the given action.
	 * Each tick reads from settingsCache so it always reflects the latest settings
	 * without needing to be restarted whenever settings change.
	 */
	private startTimer(actionId: string): void {
		this.stopTimer(actionId);
		const tick = async () => {
			const keyAction = this.buttonActions.get(actionId);
			const settings = this.settingsCache.get(actionId);
			if (!keyAction || !settings) return;
			await this.refreshDisplay(keyAction, settings);
		};
		void tick();
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
		const { secret: rawSecret, digits, period, algorithm, logoData } = settings;
		const secret = rawSecret ? decryptSecret(rawSecret) : null;
		const { fontFamily, timerStyle } = getGlobalSettings();

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
			const p = period ?? 30;
			const totp = new TOTP({
				secret: Secret.fromBase32(secret),
				digits: digits ?? 6,
				period: p,
				algorithm: algorithm ?? "SHA1",
			});
			const token = totp.generate();
			const remaining = p - (Math.floor(Date.now() / 1000) % p);
			const image = renderButton({ token, remaining, period: p, logoData, fontFamily, timerStyle });
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
