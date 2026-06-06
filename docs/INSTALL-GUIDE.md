# Installing Power BI Viewer

Welcome! This short guide walks you through downloading, installing, and updating Power BI Viewer. No technical experience needed — just follow the numbered steps.

## Downloading the installer

1. Open the project's **GitHub Releases** page in your web browser. (Your team will share the link with you.)
2. At the top you'll see the **latest release**. Look in its list of files for the one named like:

   `Power BI Viewer-<version>-Windows-Setup.exe`

   (The `<version>` part is just a number, for example `1.2.0`.)
3. Click that file to download it. It will save to your **Downloads** folder.

## The "Windows protected your PC" warning

When you open the installer, Windows may show a **blue screen** that says **"Windows protected your PC"** and mentions an **"Unknown publisher."**

This is completely expected. The app simply isn't "code-signed" yet, so Windows doesn't recognize it by name. It is safe — it's your own company's app.

To continue:

1. Click **More info**.
2. Click the **Run anyway** button that appears.

## Installing and launching

1. Follow the prompts in the installer and let it finish.
2. When it's done, open **Power BI Viewer** from your **Start menu** (or the desktop shortcut, if one was created).
3. That's it — you're ready to go!

## Getting updates

There is **no automatic update**. When a newer version is posted:

1. Go back to the **GitHub Releases** page.
2. Download the new `Power BI Viewer-<version>-Windows-Setup.exe` from the latest release.
3. Run it just like before. It will **replace** your existing version — no need to uninstall first.

## Rolling back to a previous version

If a new version ever misbehaves, you can go back to an older one. Older releases stay available on the Releases page.

1. On the **GitHub Releases** page, scroll down to the **previous release** you want.
2. Download that release's `Power BI Viewer-<version>-Windows-Setup.exe`.
3. Run it to reinstall the older version.

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
