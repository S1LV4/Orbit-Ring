# Discord Voice Control

OrbitRing plugin that mutes and deafens you in Discord voice from the ring.

## Actions

| id | What it does |
| --- | --- |
| `toggle_mute` | Mutes or unmutes your microphone |
| `toggle_deafen` | Turns your Discord audio off or on (deafening also mutes) |

## How it talks to Discord

The plugin connects to the Discord app running on the same computer (its local RPC pipe) and
asks for authorization with OAuth (PKCE). Discord shows a window asking you to authorize
OrbitRing; once you accept, the token is saved in `~/.orbit/credentials.json` and reused, and
refreshed when it expires. The file is encrypted for your Windows user (DPAPI), so it cannot be
read from another account, another machine or a backup; a file saved in clear by an older version
is encrypted the next time it is read. Tokens and authorization codes are never written to the log.

There is no keyboard-shortcut fallback: without authorization the buttons do nothing but say so,
and a click asks Discord for authorization again.

## Where you see the authorization

**Settings → Plugins → Installed**, on the Discord card:

| Status | Meaning |
| --- | --- |
| Authorized as *name* (green) | voice control works |
| Waiting for your approval in the Discord window (amber) | accept in Discord |
| Not authorized (red) + **Authorize** button | refused, failed or not allowed — click Authorize |
| Connecting to Discord… / Discord is not running | open Discord; the plugin reconnects every 15 s |

**In the ring**, the two buttons show the same state: lit when muted/deafened once authorized,
amber while waiting, red with "click to authorize" when not authorized. When authorization is
refused or fails, a notice also appears at the edge of the screen and clears once Discord is
authorized.

Texts follow the app language (English, Portuguese, Spanish).
