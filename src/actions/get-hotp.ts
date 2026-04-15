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
import { fetchLogo } from "../logo.js";
import { getGlobalSettings, onGlobalSettingsChanged } from "../globals.js";
import { renderButton } from "../render.js";
import { resolveOutputType, typeText } from "../utils.js";

type HotpSettings = {
	secret?: string;
	initial_count?: string;
	auto_increase?: boolean;
	output?: string | [string[], string | null];
	website?: string;
	logoData?: string;
};

@action({ UUID: "com.cypher-phunk.otp.gethotp" })
export class GetHOTP extends SingletonAction<HotpSettings> {
	/** Stored action references keyed by action ID for global-settings re-render. */
	private readonly buttonActions = new Map<string, KeyAction<HotpSettings>>();
	/** Cached settings per action, needed by the global-settings listener. */
	private readonly settingsCache = new Map<string, HotpSettings>();

	constructor() {
		super();
		onGlobalSettingsChanged(() => {
			for (const [id, keyAction] of this.buttonActions) {
				const settings = this.settingsCache.get(id) ?? {};
				void this.refreshDisplay(keyAction, settings);
			}
		});
	}

	override async onWillAppear(ev: WillAppearEvent<HotpSettings>): Promise<void> {
		const keyAction = ev.action as KeyAction<HotpSettings>;
		this.buttonActions.set(ev.action.id, keyAction);
		this.settingsCache.set(ev.action.id, ev.payload.settings);
		await this.refreshDisplay(keyAction, ev.payload.settings);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<HotpSettings>): Promise<void> {
		const keyAction = ev.action as KeyAction<HotpSettings>;
		this.buttonActions.set(ev.action.id, keyAction);
		this.settingsCache.set(ev.action.id, ev.payload.settings);
		await this.refreshDisplay(keyAction, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<HotpSettings>): Promise<void> {
		const { secret, initial_count, auto_increase, output } = ev.payload.settings;
		const outputType = resolveOutputType(output);

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

	override async onSendToPlugin(ev: SendToPluginEvent<{ type: string; website?: string }, HotpSettings>): Promise<void> {
		if (ev.payload.type !== "loadLogo") return;

		const keyAction = ev.action as KeyAction<HotpSettings>;
		const currentSettings = this.settingsCache.get(ev.action.id) ?? {};
		const website = ev.payload.website ?? currentSettings.website;
		if (!website) return;

		const { logoDevApiKey } = getGlobalSettings();
		const logoData = await fetchLogo(website, logoDevApiKey);
		if (!logoData) {
			await streamDeck.ui.sendToPropertyInspector({ type: "logoFailed" });
			return;
		}

		const newSettings: HotpSettings = { ...currentSettings, logoData };
		await keyAction.setSettings(newSettings);
		await streamDeck.ui.sendToPropertyInspector({ type: "logoLoaded" });
		// onDidReceiveSettings will fire and refresh the display.
	}

	// ── Display ───────────────────────────────────────────────────────────────

	private async refreshDisplay(keyAction: KeyAction<HotpSettings>, settings: HotpSettings): Promise<void> {
		const { secret, initial_count, logoData } = settings;
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
