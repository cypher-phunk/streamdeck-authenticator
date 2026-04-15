import streamDeck from "@elgato/streamdeck";

import { GetHOTP } from "./actions/get-hotp.js";
import { GetTOTP } from "./actions/get-totp.js";
import { initGlobalSettings } from "./globals.js";

streamDeck.actions.registerAction(new GetTOTP());
streamDeck.actions.registerAction(new GetHOTP());

// connect() opens the WebSocket — initGlobalSettings() sends getGlobalSettings
// over that same socket. Both must start concurrently: awaiting initGlobalSettings
// first deadlocks because its send() blocks until the socket is open.
await Promise.all([streamDeck.connect(), initGlobalSettings()]);
