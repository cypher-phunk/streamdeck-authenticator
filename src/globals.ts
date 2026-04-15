import streamDeck from "@elgato/streamdeck";

export type GlobalSettings = {
	logoDevApiKey?: string;
	fontFamily?: string;
	encryptSecrets?: boolean;
	timerStyle?: "number" | "bar";
};

export const DEFAULT_FONT = "Liberation Sans, sans-serif";

let _settings: GlobalSettings = {};
const _listeners: Array<(s: GlobalSettings) => void> = [];

// Resolves once the first getGlobalSettings response has been received.
// onWillAppear waits on this before running encryption migration so it never
// treats encryptSecrets as false just because the response hasn't arrived yet.
let _resolveReady!: () => void;
const _ready = new Promise<void>((resolve) => { _resolveReady = resolve; });

export function getGlobalSettings(): GlobalSettings {
	return _settings;
}

/** Resolves once global settings have been received from the daemon for the first time. */
export function whenGlobalSettingsReady(): Promise<void> {
	return _ready;
}

/** Register a callback that fires whenever global settings change. */
export function onGlobalSettingsChanged(listener: (s: GlobalSettings) => void): void {
	_listeners.push(listener);
}

/** Must be called once at plugin startup, before `streamDeck.connect()`. */
export async function initGlobalSettings(): Promise<void> {
	_settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
	_resolveReady();

	streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
		_settings = (ev.settings ?? {}) as GlobalSettings;
		_listeners.forEach((l) => l(_settings));
	});
}
