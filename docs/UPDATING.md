# Updating Power BI Viewer (operator guide)

This is for **you** (the maintainer), not end users. It explains how the app
updates itself and how to push an urgent fix immediately.

## How updates normally work

- **Windows:** the app checks GitHub on launch and every ~2 hours, downloads any
  newer version **in the background**, and installs it **silently the next time
  the user closes and reopens the app.** No clicks, no prompt. Most updates are
  invisible — the app just becomes the new version, still signed in. (A re-login
  only happens when an update changes the Microsoft permissions it requests.)
- **macOS:** Apple won't allow silent updates for an unsigned app, so on launch
  the app shows a **"A newer version is available → Download"** dialog. Mac users
  install manually. macOS **cannot** be force-updated.

To ship a normal update: just run the **"Build and Release"** workflow (Actions
tab → Run workflow → patch/minor/major). Windows users get it on their next
restart; Mac users get the notice.

## Pushing an URGENT fix NOW (the force lever)

When something is broken and you need it live across all Windows machines fast
(not waiting for each user's next restart):

1. **Publish the fix** — run the Build and Release workflow. Note the new version
   it produces (e.g. `v2.1.5`).
2. **Flip the force lever** — edit [`update-policy.json`](../update-policy.json)
   on the `main` branch (you can do this right in GitHub's web editor) and set:
   ```json
   { "forceMinVersion": "2.1.5" }
   ```
   Commit it. **No build needed for this step** — it's just a one-line file.
3. **Done.** Within **~10–15 minutes**, every running Windows app below `2.1.5`
   downloads it and **auto-restarts into it** (after a brief "a required update
   is ready" warning — wall displays restart on their own after ~30s).

That ~10–15 min is the floor: the app is a polling client, so it has to *notice*
the change — there's no way to instantly push to all machines. It is fully
hands-free, though; you don't chase anyone.

**After the urgent push settles**, you can leave `forceMinVersion` where it is
(it only forces apps *below* that version, so once everyone's updated it's inert)
or set it back to `0.0.0`. Either is fine.

## Rolling back a bad version

You can't "un-publish" to a lower number (the updater never downgrades users). To
recover from a bad release, **publish a higher version with the fix** and, if
urgent, set `forceMinVersion` to it. Everyone auto-jumps forward to the good one.

## Notes

- Rapid-fire releases are safe: the updater always jumps to the **latest**
  published release, skipping any intermediate versions.
- A failed update never harms anyone — the download is isolated and the running
  version keeps working; all updater errors are swallowed.
- The very first updater-capable build (v2.1.1) had to be installed manually by
  everyone once. From there on, Windows is hands-free.

## Fast-follows that remove the last friction

- **Windows code-signing cert** (~$10/mo Azure Trusted Signing): removes the
  SmartScreen warning on the first manual install and hardens the update chain.
- **Apple Developer ID** (~$99/yr): would let macOS auto-update silently too
  (and remove its Gatekeeper warning) — turning Mac into the same hands-free
  experience as Windows.
