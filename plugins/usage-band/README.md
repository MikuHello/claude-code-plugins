# usage-band

A Claude Code mod that draws a usage band under the prompt:

- **Context**: a bar of the context window coloured by category (as `/context` breaks it down), the share used and the tokens; under it, each category's tokens and share of what is used, plus the space left before auto-compact. Hover a category to light it.
- **Limits**: the 5-hour and 7-day plan limits (Pro / Max) with their reset times, and the session cost in US dollars at the right.

Settings: click the ⚙ at the right of the band, or run `/usage-band`, to open the settings panel: language (zh / en), position (below / above the prompt), legend layout (grid / list / inline), a switch for each module, and showing or hiding the band. The same options are stored as the plugin's `userConfig` (also listed in `/config`).

Edit the files here, then run `/reload-plugins`. Tests: `claude plugin test <this folder>`.

## Install

```
/plugin install usage-band --marketplace MikuHello/claude-code-plugins
```
