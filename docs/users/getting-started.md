# Install and start watching

[Project overview](../../README.md) · [Troubleshooting](troubleshooting.md)

## Choose a download

Use the [Releases page](https://github.com/eliottness/VacuumStream/releases). The supported
build architecture is Linux **x86_64** (also called AMD64). Choose Flatpak for immutable
gaming systems, or AppImage for a standalone executable. VacuumStream is not on Flathub.
If no release exists, [build from source](../contributing/development.md).

Download both assets and `SHA256SUMS` from the same release to verify them:

```bash
sha256sum --check SHA256SUMS
```

If you downloaded only one asset, `sha256sum --check --ignore-missing SHA256SUMS` verifies
the downloaded file. A checksum failure means you should not run that download.
Checksums detect corruption, not impersonation; download only from the project's releases.

The examples below use `0.1.2`; substitute the version you downloaded.

### Flatpak

Requires Flatpak 1.16 or newer for gamepad device permissions. In Desktop Mode:

```bash
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install --user ./VacuumStream-0.1.2-x86_64.flatpak
flatpak run io.github.eliottness.VacuumStream
```

The bundle references Flathub for runtime dependencies; this does not make it a Flathub release.
Install a newer bundle the same way to update. There is no automatic GitHub-release updater.

Early local builds used a different application ID. They are separate installations and profiles;
the public build does not migrate their settings or tokens. Sign in again rather than copying tokens.

### AppImage

```bash
chmod +x VacuumStream-0.1.2-x86_64.AppImage
./VacuumStream-0.1.2-x86_64.AppImage
```

If FUSE is unavailable:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./VacuumStream-0.1.2-x86_64.AppImage
```

Linux must permit Chromium's sandbox. Do not work around startup failures using `--no-sandbox`;
prefer Flatpak if your distribution blocks unprivileged user namespaces.

## First run

Start in guest mode: choose a Quick watch channel, or open Search and enter an exact Twitch
channel login, such as `twitch`. Guest mode does not provide general catalog search.

For personalized discovery:

1. Open **Connect Twitch** or **Settings**.
2. Leave the built-in Client ID unchanged. There is no developer registration step.
3. Choose **Sign in on another device**.
4. Scan the QR code or open the Twitch activation address displayed by the app, then enter its
   code.
5. Approve access on Twitch and return to VacuumStream.

Following starts in **Live now**. If none of your follows are live, an empty list is normal.
Choose **All channels** below the live shelf to include offline broadcasters, with avatars and
Live/Offline labels. Use **Open channel** to watch, or **Past broadcasts** to go straight to
recordings without opening a live player. An empty archive means no recordings are available;
**Retry** recovers a failed request, and **Back** returns to Home. Guests are sent to Settings
to sign in. Sign-in also enables live catalog, category, channel, and VOD discovery.

While signed in, Home and Following load a fresh first page when you enter them, including
Home when you return from playback. Choose **Refresh** to update the shelf without leaving it,
or **Load more** for the next page. There is no automatic background refresh. Existing cards
stay available while loading or after an error; **Retry** repeats the request that failed.
When there are no more pages, Load more disappears and focus returns to Refresh.

Use the arrows to move from navigation to Refresh, then Down to the cards and Load more or
Retry. Press Enter to activate an action. Refresh starts over with the current live channels;
it does not ask you to sign in again. Continue Down past the live shelf to reach the Following
mode controls; Left/Right selects **Live now** or **All channels**. The directory uses the same
Refresh, Load more, and Retry controls, with no background refresh.

On Home, choose a card under **Top categories** to browse that game's live streams.
Use the arrows and Enter to choose a stream, or **Load more** to see the next page.
If loading fails, **Retry** keeps any streams already shown. An empty category means no
channels are live there right now. **Back** or Escape returns to Home. Guests choosing a
category are sent to Settings to sign in first.

Device authorization authenticates discovery, **not the embedded player**. Twitch may show
advertisements and its own offline, regional, or error screens. Browser cookies are not imported.
VacuumStream prefers the Linux keyring. If none is available, it stores the token in its private
application-data directory with owner-only file permissions and logs a security warning.

## Favourite channels

In Search, choose **Save favourite** beside a channel's open action. Saving does not start
playback or require Twitch sign-in. A saved result shows **Saved favourite**. Guests can save
an exact channel login; signed-in search also preserves the broadcaster ID for Past broadcasts.

Home shows **Favourite channels** between Continue Watching and Recommended live (or guest
Quick watch) when entries exist. Choose **Open channel** to use the official player, or the
separate **Remove favourite** action. Entries show logins, not live status: saving a channel
does not check whether it is broadcasting.

Favourites are **local to this installation, shared across Twitch accounts, and not Twitch
follows**. Signing in, signing out, or switching accounts does not clear them. They are sorted
alphabetically and limited to 50 channels. At the limit, a visible message asks you to remove
one on Home; Escape returns there without saving or evicting anything.

From Search's Search button, Down reaches results; Right from a result reaches Save favourite,
and Left returns to Open. On Home, Right from navigation (Down on the compact bar) reaches
Continue Watching when present, otherwise favourites. Down from Continue Watching's actions
reaches favourites; Left/Right moves between favourite entries, Down reaches Remove favourite,
then the live shelf controls. Up travels back through those controls. After removal, focus moves
to a surviving neighbour, or an existing Home control when the last entry disappears. Failed
saves and removals keep their prior state and offer a retry on the same action; a failed initial
read offers **Retry favourites**. Escape leaves Search even when a save fails.

## Controls

| Input | Action |
| --- | --- |
| Arrow keys | Move focus between controls and cards |
| Enter | Activate the focused action or submit Search |
| Escape | Return to Home from a secondary screen |
| ArrowDown in a text field | Leave text editing for navigation |

Left/Right edit text while a field is focused. Search text uses normal keyboard input.
On the player screen, focus the separate play/pause or mute button and press Enter.
Optional shortcuts: `/` opens Search, `F10` opens Settings.

Choose **Quality** for live streams or past broadcasts. Left/Right chooses among the options
Twitch supplies; Enter requests a change without changing play/pause or mute. Options may
appear only after playback starts. **Close** returns focus to Quality; Escape still returns
Home. A requested quality is not confirmation of a change; Auto can use different resolutions.

Choose **Captions**, between Quality and Past broadcasts, for live streams or recordings.
Left/Right selects **Show**, **Hide**, or **Close**; Enter activates the choice. Show and Hide
request a setting from Twitch, not a report that captions are available or rendering. Captions
come from the broadcaster's own stream; Twitch renders and styles them. VacuumStream does
not detect caption availability or generate captions. Until you choose Show or Hide, Twitch's
own default is untouched. These commands are disabled until the player is ready, but Captions
and Close remain reachable while loading or offline. Close returns focus to Captions; Escape
returns Home. Requests are not carried over to another source, and a failed request can be retried.
For older recordings with an unknown broadcaster, Right from Captions goes to Fullscreen,
bypassing the disabled Past broadcasts shortcut; Left follows the same route back.

For live channels, choose **Show chat** between Past broadcasts and Fullscreen to read live
chat beside the video. Chat starts hidden each time you open or change a source. **Hide chat**
removes the pane; **Reload chat** reloads only chat, without restarting playback. Left/Right
walks Hide chat, Enter chat, Reload chat, Fullscreen and back. Down from Show/Hide chat reaches
Enter chat, then Reload chat; Up returns to Hide chat. These controls remain available while
the player is loading or offline. Showing or reloading chat does not move focus into Twitch.

On a fresh profile, Twitch may ask for cookie/advertising consent before showing messages.
Choose **Enter chat** to interact with **Twitch's own interface**, not a VacuumStream dialog.
Use a physical keyboard or Steam Input keyboard mapping: **Tab / Shift+Tab** moves among
Twitch's controls, **Enter** activates the focused choice, and **Escape** returns to Hide chat.
A persistent hint outside the embeds remains visible in this mode. Holding Escape exits chat
only; release and press Escape again to return Home. Hide, Reload, a source change, leaving
playback, or switching away from the window also ends the mode; returning never resumes it.
**Native gamepad input into the chat frame is not yet supported.** Map Tab, Shift+Tab, Enter,
and Escape in Steam Input for consent controls. There is no VacuumStream controller chat
composer or VOD chat replay. Twitch handles chat's connection and error messages;
VacuumStream sign-in does not sign you into chat. The enlarged pane stacks below the video
on smaller screens, with scrolling rather than covering or shrinking the video below 400x300.

Past broadcasts show elapsed/total time and jumps back or forward by 30 seconds or 5 minutes.
Press Down from Back to reach the jumps, Left/Right to choose, and Enter to seek; Up returns
to Back. Seeking keeps focus on the jump without changing play/pause or mute. Jumps become
available when Twitch reports a ready recording and its duration. Live streams have no jumps.

Reopening a part-watched recording offers **Resume from H:MM:SS**, **Start over**, and
**Back** before loading the player. Use Left/Right or Up/Down and Enter to choose. Start over
clears the old position; Back leaves without starting playback. If local progress cannot be
read, you can still choose **Play without resume** or Back.

Home shows **Continue Watching** above live channels when saved recordings exist, even while
signed out. It shows the ten most recently updated positions, with titles and saved elapsed/total
time. Older entries without a title appear as **Recording <videoId>**; their Past broadcasts
shortcut is disabled because the broadcaster is unknown. Selecting an entry opens the same
Resume / Start over / Back choices; nothing plays before you choose. The shelf does not check
whether a recording is still available on Twitch.

From Home navigation, Right (Down on the compact navigation bar) reaches the first entry.
Left/Right moves between entries; Down reaches **Forget progress**, then favourites when present,
then the live shelf controls.
Up returns in the opposite direction. **Forget progress deletes the saved position**, not just
its card. Focus moves to the next surviving entry, or a Home control when none remain. A failed
delete keeps the entry and offers **Retry forget progress**; a failed read offers **Retry Continue
Watching**. These positions are local to this installation and shared across Twitch accounts,
including when signed out.

Positions are **local to this installation and shared across Twitch account changes**. They
are not synced to Twitch or other devices. Observed progress is checkpointed every 15 seconds
when it changes, and on pause, confirmed seeking, and normal departure. An abrupt app or
system shutdown can lose progress since the last checkpoint. Completion reported by Twitch
clears the bookmark; merely approaching the current end of a growing archive does not.
Storage failures appear outside the video while playback continues; a failed write is not
saved progress. Live streams do not use bookmarks.

Native gamepads map D-pad/left stick to arrows, A to Enter, and B to Escape. If the controller
is not detected, use the same mapping in Steam Input.

## Steam Deck and Bazzite Gaming Mode

Install in Desktop Mode. Add VacuumStream from the application list as a non-Steam game.
If adding it manually, use `/usr/bin/flatpak` as the executable and this launch argument:

```text
run io.github.eliottness.VacuumStream
```

Return to Gaming Mode. Use the Steam Input mapping above if needed. VacuumStream starts
fullscreen when both `SteamOS=1` and `SteamGamepadUI=1` are supplied by the session.
These are target environments; report hardware-specific results with your OS version and bindings.
