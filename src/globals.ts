import streamDeck from "@elgato/streamdeck";

export type GlobalSettings = {
	logoDevApiKey?: string;
	fontFamily?: string;
};

export const DEFAULT_FONT = "Liberation Sans, sans-serif";

let _settings: GlobalSettings = {};
const _listeners: Array<(s: GlobalSettings) => void> = [];

export function getGlobalSettings(): GlobalSettings {
	return _settings;
}

/** Register a callback that fires whenever global settings change. */
export function onGlobalSettingsChanged(listener: (s: GlobalSettings) => void): void {
	_listeners.push(listener);
}

/** Must be called once at plugin startup, before `streamDeck.connect()`. */
export async function initGlobalSettings(): Promise<void> {
	_settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();

	streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
		_settings = (ev.settings ?? {}) as GlobalSettings;
		_listeners.forEach((l) => l(_settings));
	});
}
