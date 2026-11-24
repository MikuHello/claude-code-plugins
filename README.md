# claude-code-plugins

MikuHello's Claude Code plugins, in one marketplace. 自制的 Claude Code 插件合集。

## Plugins

| Plugin | What it does |
| --- | --- |
| [usage-band](plugins/usage-band) | A band under the prompt: context usage coloured by category (hover to light one), the 5-hour / 7-day plan limits with reset times, and the session cost. 输入框下方的用量栏：按类型着色的上下文占用、5 小时 / 7 天额度与重置时间、会话花费。 |

## Install

At the prompt of a Claude Code session (2.1.275 or later):

```
/plugin install usage-band --marketplace MikuHello/claude-code-plugins
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin install usage-band --marketplace MikuHello/claude-code-plugins
```

Update later with `claude plugin update usage-band@mikuhello`.
