# pi-exit

A small [pi](https://github.com/earendil-works/pi) extension that adds familiar ways to leave an interactive session.

## Commands

The canonical command is `/exit`. These aliases have the same effect:

| Input | Meaning |
| --- | --- |
| `/exit` | Exit pi |
| `/e` | Alias for `/exit` |
| `/ex` | Alias for `/exit` |
| `/exi` | Alias for `/exit` |
| `:q` | Alias for `/exit` |

Matching is case-sensitive and applies to the complete trimmed input. For example, `/exit now`, `/E`, `:q!`, and `:q foo` are ordinary prompts rather than exit commands.

Only text entered by a person in pi's TUI can trigger this extension. RPC input, print/JSON modes, messages injected by other extensions, and prompts with image attachments are not intercepted.

## Behavior

An exit input uses pi's graceful extension shutdown API, following the same shutdown path as the built-in `/quit` command. It does not call `process.exit()` directly and does not add a confirmation dialog.

If the agent is running, pi-exit first aborts the current operation and discards queued steering or follow-up messages, then requests graceful shutdown. The request is idempotent.

The slash autocomplete list contains only the canonical `/exit` entry. Aliases do not appear in autocomplete and are recognized when submitted.

### Known timing difference from `/quit`

Pi queues ordinary extension input while session compaction is running. If `/exit` or an alias is submitted during compaction, it takes effect after compaction finishes. The built-in `/quit` command can exit immediately during that state.

## Requirements

- Node.js 22.19 or newer
- `@earendil-works/pi-coding-agent` 0.84.x or compatible
- `@earendil-works/pi-tui` 0.84.x or compatible

## Installation

Install the npm package globally in pi so the commands are available in every project:

```bash
pi install npm:@tbanowl/pi-exit
```

You can also install the package directly from GitHub:

```bash
pi install git:github.com/tbanowl/pi-exit
```

Restart pi after installation. To remove the npm package:

```bash
pi remove npm:@tbanowl/pi-exit
```

To try the published package without installing it:

```bash
pi -e npm:@tbanowl/pi-exit
```

For local development, load the extension entry point from this checkout:

```bash
pi -e ./extensions/index.ts
```

## Development

Install development dependencies and run all automated checks:

```bash
npm install
npm run check
```

Individual commands:

```bash
npm run typecheck
npm test
```

## Manual TUI smoke test

1. Start `pi -e ./extensions/index.ts`.
2. Confirm slash autocomplete shows `/exit` but not `/e`, `/ex`, or `/exi`.
3. Start a fresh pi process for each of `/exit`, `/e`, `/ex`, `/exi`, and `:q`; verify each exits without confirmation.
4. Start a streaming answer, submit an exit alias, and verify generation is aborted before pi exits.
5. Verify `/exit now`, `/E`, `:q!`, and `:q foo` are sent to the model rather than intercepted.
6. Load a small observer extension with a `session_shutdown` handler and verify it receives `{ reason: "quit" }` on exit.
7. Start compaction, submit an exit alias, and verify pi exits after compaction finishes.
8. Run `pi install npm:@tbanowl/pi-exit` (or install this checkout by absolute path before the first npm release), start pi from another directory, and repeat an exit check.

## License

MIT
