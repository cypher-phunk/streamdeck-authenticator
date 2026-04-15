import streamDeck from "@elgato/streamdeck";

import { GetHOTP } from "./actions/get-hotp.js";
import { GetTOTP } from "./actions/get-totp.js";
import { initGlobalSettings } from "./globals.js";

await initGlobalSettings();

streamDeck.actions.registerAction(new GetTOTP());
streamDeck.actions.registerAction(new GetHOTP());

streamDeck.connect();
