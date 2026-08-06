import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	createExitInputHandler,
	withExitAutocomplete,
} from "./exit-input.ts";

export default function piExit(pi: ExtensionAPI): void {
	const handleExitInput = createExitInputHandler();

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode === "tui") {
			ctx.ui.addAutocompleteProvider(withExitAutocomplete);
		}
	});

	pi.on("input", (event, ctx) => handleExitInput(event, ctx));
}
