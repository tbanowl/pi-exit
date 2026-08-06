import type {
	ExtensionContext,
	InputEvent,
	InputEventResult,
} from "@earendil-works/pi-coding-agent";
import type {
	AutocompleteItem,
	AutocompleteProvider,
	AutocompleteSuggestions,
} from "@earendil-works/pi-tui";

export const EXIT_COMMAND = "/exit";
export const EXIT_INPUTS = [EXIT_COMMAND, "/e", "/ex", "/exi", ":q"] as const;

const EXIT_INPUT_SET = new Set<string>(EXIT_INPUTS);

export const EXIT_COMPLETION: Readonly<AutocompleteItem> = {
	value: "exit",
	label: "exit",
	description: "Exit pi",
};

type ExitInputEvent = Pick<InputEvent, "text" | "images" | "source">;
type ExitInputContext = Pick<
	ExtensionContext,
	"mode" | "isIdle" | "abort" | "shutdown"
>;

export function isExitInput(text: string): boolean {
	return EXIT_INPUT_SET.has(text.trim());
}

export function shouldHandleExitInput(
	event: ExitInputEvent,
	ctx: ExitInputContext,
): boolean {
	return (
		ctx.mode === "tui" &&
		event.source === "interactive" &&
		(event.images?.length ?? 0) === 0 &&
		isExitInput(event.text)
	);
}

/**
 * Create a stateful input handler. One handler instance issues at most one
 * shutdown request, even if pi delivers duplicate input while shutting down.
 */
export function createExitInputHandler() {
	let shutdownRequested = false;

	return (
		event: ExitInputEvent,
		ctx: ExitInputContext,
	): InputEventResult => {
		if (!shouldHandleExitInput(event, ctx)) {
			return { action: "continue" };
		}

		if (shutdownRequested) {
			return { action: "handled" };
		}

		shutdownRequested = true;
		if (!ctx.isIdle()) {
			ctx.abort();
		}
		ctx.shutdown();

		return { action: "handled" };
	};
}

function exitCompletionPrefix(
	lines: string[],
	cursorLine: number,
	cursorCol: number,
): string | undefined {
	const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
	if (!textBeforeCursor.startsWith("/") || textBeforeCursor.includes(" ")) {
		return undefined;
	}

	const query = textBeforeCursor.slice(1);
	return "exit".startsWith(query) ? textBeforeCursor : undefined;
}

function addExitCompletion(
	suggestions: AutocompleteSuggestions | null,
	prefix: string,
): AutocompleteSuggestions {
	if (suggestions?.items.some((item) => item.value === EXIT_COMPLETION.value)) {
		return suggestions;
	}

	const currentItems = suggestions?.items ?? [];
	return {
		prefix: suggestions?.prefix ?? prefix,
		// Pi submits the selected slash completion when Enter is pressed. Once
		// the user has typed /e, keep /exit first so built-ins such as /export
		// do not win. A bare slash keeps pi's original default selection.
		items:
			prefix === "/"
				? [...currentItems, { ...EXIT_COMPLETION }]
				: [{ ...EXIT_COMPLETION }, ...currentItems],
	};
}

/** Add only the canonical /exit candidate while preserving pi's provider. */
export function withExitAutocomplete(
	current: AutocompleteProvider,
): AutocompleteProvider {
	return {
		...(current.triggerCharacters
			? { triggerCharacters: current.triggerCharacters }
			: {}),

		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const suggestions = await current.getSuggestions(
				lines,
				cursorLine,
				cursorCol,
				options,
			);
			const prefix = exitCompletionPrefix(lines, cursorLine, cursorCol);

			if (prefix === undefined || options.signal.aborted) {
				return suggestions;
			}

			return addExitCompletion(suggestions, prefix);
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			return current.applyCompletion(
				lines,
				cursorLine,
				cursorCol,
				item,
				prefix,
			);
		},

		...(current.shouldTriggerFileCompletion
			? {
					shouldTriggerFileCompletion: (
						lines: string[],
						cursorLine: number,
						cursorCol: number,
					) =>
						current.shouldTriggerFileCompletion!(
							lines,
							cursorLine,
							cursorCol,
						),
				}
			: {}),
	};
}
