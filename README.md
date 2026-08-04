<p align="center">
  <img src="https://www.image2url.com/r2/default/images/1785805581264-afd76f22-9fb5-4e44-9c28-2341944c00d8.png" alt="Banner" width="160">
</p>

<h2 align="center">Nuz &amp; Denji's Userplugins</h2>

<p align="center">
  Report bugs or request features through
  <a href="https://github.com/NuzProjects/Vencord-Userplugins/issues">GitHub Issues</a>.
</p>

## Installation

1. Clone or download this repository.
2. Copy the plugin folder you want into:

```text
Vencord/src/userplugins/
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

*For additional help, visit the [Official Documentation](https://docs.vencord.dev/installing/#installing-your-custom-build)*

---

## Plugins

### Hide Chat Icons

Select individual icons to remove from view in the text field.

**Features:**

* Automatically detects any plugin buttons, allowing customization of every button imaginable.
* Automatically hides Gift and Apps buttons

---

### Math Count

Generates randomized math expressions.

> The server must have math expressions enabled.

**Features:**

* `/count` command
* Chat-bar calculator button
* Solves the previous counting equation
* Detects Nitro and adjusts message-length limits
* Prevents double counting

---

### Auto Reactor

Automatically reacts to messages from yourself or selected users.

**Features:**

* Works in servers, DMs, and group DMs
* Assign different reactions to selected users
* Supports Unicode and custom emojis

*This userplugin has a chance of getting you banned. Use at your own risk!*

---

### Staff Crowns

Adds a Crown/Tag to Server Owners (or Admins/Management)

**Features:**

* Crowns for Owners, Administrators, and Moderators

*This plugin was ported from **BetterDiscord.***

---

### Role Mention Icons

Displays icons beside role mentions.

> **BetterDiscord Port:** Ported from Neodymium's BetterDiscord `RoleMentionIcons` plugin.

**Features:**

* Adds role icons to mentions
* Falls back to a default people icon

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
