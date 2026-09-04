# PostBot

Discord bot for displaying and managing a Minecraft server status.

The bot can:

- Display the Minecraft server IP, version, status, mods, and plugins.
- Refresh active status embeds automatically every minute.
- Start and stop the server through the configured WOL web endpoint.
- Update server information through Discord commands.

## Requirements

- Node.js 18 or newer
- A Discord bot application with the Message Content intent enabled
- Access to the WOL web endpoint

## Installation

```bash
npm install
```

Create a local `.env` file in the project root:

```env
DISCORD_TOKEN=your_discord_bot_token
WOL_BASE_URL=https://your-host.example
```

`.env` is ignored by Git. Never commit the Discord token.

## Configuration

Edit `server-config.json` to set the Minecraft server information:

```json
{
  "ip": "mc.example.com",
  "version": "1.21.9",
  "plugins": true,
  "mods": false,
  "driveLink": "https://example.com/mods",
  "modsList": [],
  "pluginsList": []
}
```

The `plugins` and `mods` flags are stored for configuration purposes. The displayed lists are controlled by `pluginsList` and `modsList`.

## Running the bot

```bash
node bot.js
```

The bot loads active embeds from `active-embeds.json` and updates them every minute. This file is maintained automatically.

## Standalone status check

To query the configured WOL status endpoint once:

```bash
node index.js
```

## Discord commands

Commands are currently restricted to the Discord username `xalri`.

| Command | Description |
| --- | --- |
| `!serveur` or `!server` | Post a server status embed with start and stop buttons. |
| `!config ip <ip>` | Change the Minecraft server IP. |
| `!config version <version>` | Change the Minecraft version. |
| `!config plugins <true\|false>` | Enable or disable plugins in the configuration. |
| `!config mods <true\|false>` | Enable or disable mods in the configuration. |
| `!config drive <url>` | Change the mods download link. |
| `!config add-mod <name>` | Add a mod to the displayed list. |
| `!config remove-mod <name>` | Remove a mod from the displayed list. |
| `!config add-plugin <name\|url>` | Add a plugin, optionally with a link. |
| `!config remove-plugin <name>` | Remove a plugin. |
| `!embeds list` | List embeds that are updated automatically. |
| `!embeds clear` | Stop automatic updates for all tracked embeds. |
| `!aide` or `!help` | Display the help embed. |
