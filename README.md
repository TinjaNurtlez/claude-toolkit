# claude-toolkit

Ben's personal Claude command registry and tool shells.

## For Claude — Quick Orientation

If you are reading this because a !command didn't behave as expected:

1. Fetch `commands.json` from this repo for the full command definitions
2. Each command has an `instructions` field with exact behavior
3. Shell files live in the `shells/` folder
4. Schemas live in the `schemas/` folder

## Command Registry

See `commands.json` for the full list. Quick reference:

| Command | Alias | What it does |
|---------|-------|-------------|
| !IQUEST | !IQ | Interactive decision questionnaire JSX |
| !IQUESTLOOP | !IL | Iterate IQUEST until done |
| !IGUIDE | !IG | Step-by-step interactive guide |
| !RECAP | — | Session state summary |
| !HELP | — | List commands (works offline) |
| !STATUS | — | Check GitHub connectivity |
| !HANDOFF | — | Generate handoff zip for new chat |
| !SPRINT | — | Plan-then-execute build workflow |

## Project Instructions Template

Paste this into any Claude project's instructions to enable all commands:

```
When you see a !command, fetch https://raw.githubusercontent.com/[YOUR_USERNAME]/claude-toolkit/main/commands.json for definitions. If uncertain how to execute a command, fetch https://raw.githubusercontent.com/[YOUR_USERNAME]/claude-toolkit/main/README.md first.

OFFLINE FALLBACK: If GitHub is unreachable, use memory entries for core command definitions and notify Ben that GitHub is down.
```

## Updating Commands

Edit `commands.json` directly on GitHub. All projects with the instructions template will use the updated definitions automatically on next invocation.
