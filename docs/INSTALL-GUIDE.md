# Installing Power BI Viewer

Welcome! This short guide walks you through downloading, installing, and updating Power BI Viewer. No technical experience needed — just follow the numbered steps for your operating system.

## Downloading

1. Open the project's **GitHub Releases** page in your web browser. (Your team will share the link with you.)
2. At the top you'll see the **latest release**. Under **Assets**, pick the file that matches your computer:

   - **Windows:** `Power BI Viewer-<version>-Windows-Setup.exe`
   - **Mac (Apple Silicon — M1/M2/M3/M4):** `Power BI Viewer-<version>-Mac-arm64.zip`
   - **Mac (Intel):** `Power BI Viewer-<version>-Mac-x64.zip`

   (The `<version>` part is just a number, for example `1.3.0`. If you're not sure which Mac you have, click the Apple menu → "About This Mac". "Apple M…" = arm64; "Intel" = x64.)
3. Click the file to download it. It will save to your **Downloads** folder.

## Installing on Windows

When you open the installer, Windows may show a **blue screen** that says **"Windows protected your PC"** and mentions an **"Unknown publisher."**

This is completely expected. The app simply isn't "code-signed" yet, so Windows doesn't recognize it by name. It is safe — it's your own company's app.

To continue:

1. Click **More info**.
2. Click the **Run anyway** button that appears.
3. Follow the installer prompts.
4. When it's done, open **Power BI Viewer** from your **Start menu** (or the desktop shortcut).

## Installing on Mac

The Mac download is a `.zip` file containing the app.

1. **Double-click** the downloaded `.zip` in your Downloads folder — it will extract to a file named **Power BI Viewer.app**.
2. **Drag** that `Power BI Viewer.app` into your **Applications** folder.
3. **Open it from Applications.** The first time, macOS will warn that "Power BI Viewer can't be opened because Apple cannot check it for malicious software" — this is normal for an unsigned app. Click **Cancel**.
4. Open **System Settings → Privacy & Security**, scroll to the bottom, and you'll see "Power BI Viewer was blocked…" with an **Open Anyway** button. Click it. (On older macOS, the option lives in **System Preferences → Security & Privacy → General**.)
5. Confirm the second prompt. The app will launch and remember your choice — future opens are normal double-clicks.

## Getting updates

There is **no automatic update**. When a newer version is posted:

1. Go back to the **GitHub Releases** page.
2. Download the new file for your operating system from the latest release.
3. **Windows:** run the new `.exe` — it replaces your existing version (no uninstall needed).
   **Mac:** extract the new `.zip`, drag the new `Power BI Viewer.app` into Applications, and let it **Replace** the existing one when prompted.

## Rolling back to a previous version

If a new version ever misbehaves, you can go back to an older one. Older releases stay available on the Releases page.

1. On the **GitHub Releases** page, scroll down to the **previous release** you want.
2. Download that release's file for your operating system.
3. Install it the same way (Windows: run the `.exe`; Mac: extract the `.zip` and replace the app in Applications).

### Optional: verifying your download

If you'd like to be sure the file downloaded correctly, each release lists a **SHA-256** value in its release notes. To check it:

1. Open **PowerShell**.
2. Run the following command, replacing `<file>` with the path to the installer you downloaded:

   ```powershell
   Get-FileHash <file>
   ```

3. Compare the result to the SHA-256 value shown in the release notes. If they match, your download is good.

---

Questions or trouble? Reach out to your team — we're happy to help.
