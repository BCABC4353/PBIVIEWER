# Power BI Viewer - Deployment Guide

## Installer Files

| Platform | File | Location |
|----------|------|----------|
| Windows | `Power BI Viewer-1.0.0-Windows-Setup.exe` | `release/` folder |
| macOS | `Power BI Viewer-1.0.0-Mac.dmg` | Build on Mac (see below) |

---

## Windows Deployment

### Installer Location
```
C:\Users\Brendan Cameron\desktop\powerbi-viewer\release\Power BI Viewer-1.0.0-Windows-Setup.exe
```

### Installation Steps for Users

1. **Copy the installer** to the user's computer (USB, network share, email, etc.)

2. **Run the installer** - Double-click `Power BI Viewer-1.0.0-Windows-Setup.exe`

3. **Bypass SmartScreen Warning** (unsigned app):
   - When "Windows protected your PC" appears, click **"More info"**
   - Click **"Run anyway"**

4. **Installation completes automatically** (one-click installer)

5. **First Launch**:
   - User clicks "Power BI Viewer" from Start Menu
   - User clicks **"Sign In"** button
   - User enters **their own Microsoft/Azure AD credentials**
   - User authorizes the app to access Power BI

### Silent Install (Command Line)
```cmd
"Power BI Viewer-1.0.0-Windows-Setup.exe" /S
```

### Uninstall
- Settings → Apps → Power BI Viewer → Uninstall
- Or: `%LOCALAPPDATA%\Programs\power-bi-viewer\Uninstall Power BI Viewer.exe`

---

## macOS Deployment

### Building the Mac Installer
**⚠️ Must be done on a Mac computer**

1. Copy the project folder to a Mac
2. Open Terminal in the project folder
3. Run:
   ```bash
   npm install
   npm run package:mac
   ```
4. Find installer at: `release/Power BI Viewer-1.0.0-Mac.dmg`

### Installation Steps for Mac Users

1. **Copy the DMG** to the user's computer

2. **Open the DMG** - Double-click `Power BI Viewer-1.0.0-Mac.dmg`

3. **Drag to Applications** - Drag the app icon to the Applications folder

4. **Bypass Gatekeeper** (unsigned app):
   - First launch will show "cannot be opened because the developer cannot be verified"
   - Go to **System Preferences → Security & Privacy → General**
   - Click **"Open Anyway"** next to the blocked app message
   - Or: Right-click the app → Open → Open

5. **First Launch**:
   - User signs in with their own Microsoft credentials

---

## User Credentials

### How It Works
- **Each user signs in with their own Microsoft account**
- Credentials are stored locally on each user's computer
- Credentials are encrypted using the operating system's secure storage
- The installer does NOT contain any user credentials

### Credential Storage Locations
| Platform | Location |
|----------|----------|
| Windows | `%APPDATA%\powerbi-viewer-auth\` |
| macOS | `~/Library/Application Support/powerbi-viewer-auth/` |

### If a User Needs to Re-authenticate
1. Open the app
2. Click their profile picture (top-right)
3. Click "Sign out"
4. Sign back in with credentials

---

## Troubleshooting

### "Windows protected your PC" (SmartScreen)
This appears because the app is not code-signed. It's safe to proceed:
1. Click "More info"
2. Click "Run anyway"

### "Cannot be opened because the developer cannot be verified" (Mac)
This appears because the app is not notarized. It's safe to proceed:
1. System Preferences → Security & Privacy → General
2. Click "Open Anyway"

### App Shows Wrong User / Old Credentials
Clear the credential cache:
- **Windows**: Delete folder `%APPDATA%\powerbi-viewer-auth\`
- **Mac**: Delete folder `~/Library/Application Support/powerbi-viewer-auth/`

### User Can't Access Reports
- Ensure user has Power BI Pro license or access to the workspace
- User must be in the same Azure AD tenant (65028f2d-9190-4d7f-bc2d-8ce298c3ba6f)

---

## Quick Deployment Checklist

### For Each User:
- [ ] Copy installer to their computer
- [ ] Run installer (bypass SmartScreen if prompted)
- [ ] Launch app from Start Menu / Applications
- [ ] User signs in with their Microsoft account
- [ ] User authorizes Power BI access
- [ ] Verify they can see their reports

---

## Future: Code Signing (Eliminates Warnings)

To eliminate security warnings, purchase code signing certificates:

| Platform | Certificate Type | Cost | Provider |
|----------|-----------------|------|----------|
| Windows | EV Code Signing | ~$300-500/year | DigiCert, Sectigo |
| macOS | Developer ID | $99/year | Apple Developer Program |

Once obtained, update `electron-builder.yml` with certificate details.
