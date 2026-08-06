import type { ExtensionContext, InputEvent } from "@earendil-works/pi-coding-agent";
import type {
	AutocompleteProvider,
	AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import {
	createExitInputHandler,
	EXIT_COMPLETION,
	EXIT_INPUTS,
	isExitInput,
	shouldHandleExitInput,
	withExitAutocomplete,
} from "./exit-input.ts";

function inputEvent(
	overrides: Partial<Pick<InputEvent, "text" | "images" | "source">> = {},
): Pick<InputEvent, "text" | "images" | "source"> {
	return {
		text: "/exit",
		source: "interactive" as const,
		...overrides,
	};
}

function exitContext(
	overrides: Partial<
		Pick<ExtensionContext, "mode" | "isIdle" | "abort" | "shutdown">
	> = {},
) {
	return {
		mode: "tui" as const,
		isIdle: vi.fn(() => true),
		abort: vi.fn(),
		shutdown: vi.fn(),
		...overrides,
	};
}

function provider(
	suggestions: AutocompleteSuggestions | null = null,
): AutocompleteProvider {
	return {
		triggerCharacters: ["#"],
		getSuggestions: vi.fn(async () => suggestions),
		applyCompletion: vi.fn((lines, cursorLine, cursorCol) => ({
			lines,
			cursorLine,
			cursorCol,
		})),
		shouldTriggerFileCompletion: vi.fn(() => true),
	};
}

const autocompleteOptions = () => ({ signal: new AbortController().signal });

describe("exit input matching", () => {
	it.each(EXIT_INPUTS)("recognizes %s", (text) => {
		expect(isExitInput(text)).toBe(true);
		expect(isExitInput(` \t${text}\n `)).toBe(true);
	});

	it.each([
		"/EXIT",
		"/E",
		":Q",
		"/exit now",
		"/e foo",
		"/ex foo",
		"/exi foo",
		":q!",
		":q foo",
		":wq",
		"explain :q",
		"",
	])("does not recognize %s", (text) => {
		expect(isExitInput(text)).toBe(false);
	});

	it("only handles image-free interactive TUI input", () => {
		expect(shouldHandleExitInput(inputEvent(), exitContext())).toBe(true);
		expect(
			shouldHandleExitInput(
				inputEvent({ source: "extension" }),
				exitContext(),
			),
		).toBe(false);
		expect(
			shouldHandleExitInput(inputEvent({ source: "rpc" }), exitContext()),
		).toBe(false);
		expect(
			shouldHandleExitInput(
				inputEvent({ images: [{ type: "image", data: "ignored", mimeType: "image/png" }] as never }),
				exitContext(),
			),
		).toBe(false);

		for (const mode of ["rpc", "json", "print"] as const) {
			expect(
				shouldHandleExitInput(inputEvent(), exitContext({ mode })),
			).toBe(false);
		}
	});
});

describe("exit handling", () => {
	it("shuts down without aborting when idle", () => {
		const ctx = exitContext();
		const result = createExitInputHandler()(inputEvent(), ctx);

		expect(result).toEqual({ action: "handled" });
		expect(ctx.abort).not.toHaveBeenCalled();
		expect(ctx.shutdown).toHaveBeenCalledOnce();
	});

	it("aborts before shutting down when busy", () => {
		const calls: string[] = [];
		const ctx = exitContext({
			isIdle: vi.fn(() => false),
			abort: vi.fn(() => calls.push("abort")),
			shutdown: vi.fn(() => calls.push("shutdown")),
		});

		const result = createExitInputHandler()(inputEvent({ text: ":q" }), ctx);

		expect(result).toEqual({ action: "handled" });
		expect(calls).toEqual(["abort", "shutdown"]);
	});

	it("issues only one shutdown request", () => {
		const ctx = exitContext();
		const handler = createExitInputHandler();

		handler(inputEvent({ text: "/e" }), ctx);
		const second = handler(inputEvent({ text: "/exit" }), ctx);

		expect(second).toEqual({ action: "handled" });
		expect(ctx.shutdown).toHaveBeenCalledOnce();
	});

	it("continues for non-exit input", () => {
		const ctx = exitContext();
		const result = createExitInputHandler()(
			inputEvent({ text: "/exit now" }),
			ctx,
		);

		expect(result).toEqual({ action: "continue" });
		expect(ctx.abort).not.toHaveBeenCalled();
		expect(ctx.shutdown).not.toHaveBeenCalled();
	});
});

describe("exit autocomplete", () => {
	it("adds only the canonical exit completion and preserves existing items", async () => {
		const current = provider({
			prefix: "/e",
			items: [{ value: "export", label: "export" }],
		});
		const wrapped = withExitAutocomplete(current);

		const result = await wrapped.getSuggestions(
			["/e"],
			0,
			2,
			autocompleteOptions(),
		);

		expect(result).toEqual({
			prefix: "/e",
			items: [EXIT_COMPLETION, { value: "export", label: "export" }],
		});
		expect(result?.items[0]).toEqual(EXIT_COMPLETION);
		expect(result?.items).not.toContainEqual(
			expect.objectContaining({ value: "e" }),
		);
	});

	it("does not make exit the default for a bare slash", async () => {
		const current = provider({
			prefix: "/",
			items: [{ value: "help", label: "help" }],
		});
		const wrapped = withExitAutocomplete(current);
		const result = await wrapped.getSuggestions(
			["/"],
			0,
			1,
			autocompleteOptions(),
		);

		expect(result?.items).toEqual([
			{ value: "help", label: "help" },
			EXIT_COMPLETION,
		]);
	});

	it.each(["/e", "/ex", "/exi", "/exit"])(
		"makes /exit the canonical completion for %s",
		async (text) => {
			const wrapped = withExitAutocomplete(provider());

			await expect(
				wrapped.getSuggestions(
					[text],
					0,
					text.length,
					autocompleteOptions(),
				),
			).resolves.toEqual({ prefix: text, items: [EXIT_COMPLETION] });
		},
	);

	it("does not add exit for parameters, uppercase, colon input, or prose", async () => {
		const current = provider();
		const wrapped = withExitAutocomplete(current);

		for (const text of ["/exit now", "/E", ":q", "say /e"]) {
			await expect(
				wrapped.getSuggestions(
					[text],
					0,
					text.length,
					autocompleteOptions(),
				),
			).resolves.toBeNull();
		}
	});

	it("does not duplicate an existing exit completion", async () => {
		const current = provider({
			prefix: "/exit",
			items: [{ ...EXIT_COMPLETION }],
		});
		const wrapped = withExitAutocomplete(current);
		const result = await wrapped.getSuggestions(
			["/exit"],
			0,
			5,
			autocompleteOptions(),
		);

		expect(result?.items).toHaveLength(1);
	});

	it("delegates completion application and file-trigger decisions", () => {
		const current = provider();
		const wrapped = withExitAutocomplete(current);
		const lines = ["/e"];

		wrapped.applyCompletion(lines, 0, 2, { ...EXIT_COMPLETION }, "/e");
		expect(current.applyCompletion).toHaveBeenCalledWith(
			lines,
			0,
			2,
			EXIT_COMPLETION,
			"/e",
		);
		expect(wrapped.shouldTriggerFileCompletion?.(lines, 0, 2)).toBe(true);
	});
});
