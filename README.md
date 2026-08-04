# Nuz & Denji's Vencord Userplugins

A collection of lightweight and configurable **Vencord userplugins** created by **NuzFlameV2** and **ItsDenji777**.

Report bugs or request features through [GitHub Issues](https://github.com/NuzProjects/Vencord-Userplugins/issues).

---

## Installation

1. Clone or download this repository.
2. Copy the plugin folder you want into:

```text
Vencord/src/userplugins/
```

For Equicord, use:

```text
Equicord/src/userplugins/
```

3. Rebuild and inject:

```bash
pnpm build
pnpm inject
```

4. Restart Discord.
5. Enable the plugin under:

```text
User Settings → Vencord → Plugins
```

---

## Plugins

### Hide Chat Icons

Hides selected buttons from Discord's message composer.

**Features:**

* Supports Discord and Vencord-added buttons
* Gift and Apps buttons are hidden by default
* Configurable through Vencord settings
* Supports Gift, Apps, GIF, Stickers, Emoji, Upload, Voice Message, and Poll

---

### mathCount

Generates randomized math expressions for Discord counting servers.

> The counting server must have math expressions enabled.

**Features:**

* `/count` slash command
* Chat-bar calculator button
* Solves the previous counting equation
* Supports addition, subtraction, multiplication, division, powers, and parentheses
* Detects Nitro and adjusts message-length limits
* Prevents double counting
* Configurable expression generation

---

### Auto Reactor

Automatically reacts to messages from yourself or selected users.

**Features:**

* Works in servers, DMs, and group DMs
* Assign different reactions to selected users
* Supports Unicode and custom emojis
* Optional reactions to your own messages
* Optional Super Reactions for Nitro users
* Prevents duplicate reactions
* Configurable channel support

---

### Staff Crowns

Displays crowns beside server staff members.

**Features:**

* Gold crown for server owners
* Silver crown for administrators
* Bronze crown for moderators
* Supports member-list decorations
* Supports profile badges
* Can ignore bot accounts
* Individual display settings

---

### Role Mention Icons

Displays icons beside role mentions.

> **BetterDiscord Port:** Ported from Neodymium's BetterDiscord `RoleMentionIcons` plugin.

**Features:**

* Adds icons to role mentions
* Supports `@everyone` and `@here`
* Can display a role's custom icon
* Falls back to a default people icon
* Updates mentions automatically
* Configurable without restarting Discord

---

## Compatibility

These plugins are intended for recent versions of:

* Vencord
* Equicord and other Vencord-based forks
* Discord Desktop

Discord interface changes may occasionally require plugin updates.

---

## License

All plugins are licensed under the **GNU General Public License v3.0 or later** (`GPL-3.0-or-later`).

---

**Last Updated:** August 3, 2026

Created with 💙💜 by **NuzFlameV2** and **ItsDenji777**
