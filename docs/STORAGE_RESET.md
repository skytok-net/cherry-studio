# KnowMe Studio - Storage Reset Guide

This guide explains how to completely reset KnowMe Studio to its default state by removing all stored application data and settings.

## ⚠️ Warning

Resetting storage will permanently delete:
- All application settings and preferences
- User theme customizations
- Chat history and conversations
- Saved assistants and workflows
- API keys and provider configurations
- Knowledge base data
- All other application data

**This action cannot be undone. Please backup any important data before proceeding.**

---

## Storage Location by Platform

KnowMe Studio (formerly Cherry Studio) stores its data in platform-specific locations:

### macOS
```
~/Library/Application Support/CherryStudio/
```

### Windows
```
%APPDATA%\CherryStudio\
```

### Linux
```
~/.config/CherryStudio/
```

---

## Reset Instructions

### macOS

1. **Quit KnowMe Studio completely**
   - Right-click the app icon in the Dock
   - Select "Quit" (or press `Cmd + Q`)

2. **Open Terminal** (Applications > Utilities > Terminal)

3. **Remove the application data directory:**
   ```bash
   rm -rf ~/Library/Application\ Support/CherryStudio
   ```

4. **Optional: Remove cache data:**
   ```bash
   rm -rf ~/Library/Caches/CherryStudio
   ```

5. **Restart KnowMe Studio**
   - The application will create a fresh data directory with default settings

### Windows

1. **Quit KnowMe Studio completely**
   - Right-click the system tray icon
   - Select "Quit"

2. **Open File Explorer**
   - Press `Win + R` to open Run dialog
   - Type `%APPDATA%` and press Enter

3. **Delete the CherryStudio folder**
   - Locate and delete the `CherryStudio` folder
   - Empty the Recycle Bin if you want to permanently remove it

4. **Optional: Remove cache data:**
   - Press `Win + R` again
   - Type `%LOCALAPPDATA%` and press Enter
   - Delete the `CherryStudio` folder if it exists

5. **Restart KnowMe Studio**
   - The application will create a fresh data directory with default settings

### Linux

1. **Quit KnowMe Studio completely**
   - Use the application menu or press `Ctrl + Q`

2. **Open Terminal**

3. **Remove the application data directory:**
   ```bash
   rm -rf ~/.config/CherryStudio
   ```

4. **Optional: Remove cache data:**
   ```bash
   rm -rf ~/.cache/CherryStudio
   ```

5. **Restart KnowMe Studio**
   - The application will create a fresh data directory with default settings

---

## Selective Data Reset

If you want to reset only specific parts of the application:

### Reset Settings Only (Keep Chat History)

**macOS/Linux:**
```bash
# Backup chats first (optional)
cp -r ~/Library/Application\ Support/CherryStudio/Data ~/Desktop/CherryStudio_Backup

# Remove settings file
rm ~/Library/Application\ Support/CherryStudio/config.json
```

**Windows:**
1. Navigate to `%APPDATA%\CherryStudio`
2. Backup the `Data` folder to your Desktop (optional)
3. Delete only the `config.json` file

### Reset Chat History Only (Keep Settings)

**macOS/Linux:**
```bash
rm -rf ~/Library/Application\ Support/CherryStudio/Data
```

**Windows:**
1. Navigate to `%APPDATA%\CherryStudio`
2. Delete only the `Data` folder

---

## Troubleshooting

### Application Won't Start After Reset

1. Ensure the application is completely closed (check Task Manager/Activity Monitor)
2. Try restarting your computer
3. Reinstall KnowMe Studio if the issue persists

### Data Still Appears After Reset

1. Verify you deleted the correct directory (see "Storage Location" above)
2. Check for multiple installations of the application
3. On Windows, ensure you emptied the Recycle Bin

### Permission Denied Errors

**macOS/Linux:**
Add `sudo` before the command (you'll need administrator password):
```bash
sudo rm -rf ~/Library/Application\ Support/CherryStudio
```

**Windows:**
Run Command Prompt or PowerShell as Administrator

---

## First Launch After Reset

After resetting storage, KnowMe Studio will:
1. ✅ Use the new KnowMe Studio branding with Prometheus Navy (#0A192D) theme
2. ✅ Show the welcome/onboarding screen
3. ✅ Require you to re-configure API keys and providers
4. ✅ Have an empty chat history
5. ✅ Use default settings and preferences

---

## Need Help?

If you encounter issues during the reset process:
- Check the application logs (Help menu > Show Logs)
- Report issues on GitHub
- Contact support

---

**Last Updated:** 2025-11-10
**Applies to:** KnowMe Studio v1.7.0+
