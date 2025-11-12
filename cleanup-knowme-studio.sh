#!/bin/bash

# KnowMe Studio Cache Cleanup Script
# This script removes all cached data, preferences, and temporary files for KnowMe Studio
# App ID: net.skytok.know-me-studio
# Product Name: KnowMe Studio

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# App identifiers
APP_ID="net.skytok.know-me-studio"
APP_NAME="KnowMe Studio"

echo -e "${YELLOW}🧹 Starting cleanup for ${APP_NAME}...${NC}"
echo

# Function to safely remove file/directory
safe_remove() {
    local path="$1"
    local description="$2"

    if [[ -e "$path" ]]; then
        rm -rf "$path" 2>/dev/null && echo -e "${GREEN}✅ Removed: $description${NC}" || echo -e "${RED}❌ Failed to remove: $description${NC}"
    else
        echo -e "${YELLOW}⚠️  Not found: $description${NC}"
    fi
}

# Function to remove files matching pattern
remove_pattern() {
    local pattern="$1"
    local description="$2"
    local found=false

    while IFS= read -r -d '' file; do
        found=true
        rm -rf "$file" 2>/dev/null && echo -e "${GREEN}✅ Removed: $(basename "$file") ($description)${NC}"
    done < <(find "$HOME/Library" -name "$pattern" -print0 2>/dev/null)

    if [[ "$found" == false ]]; then
        echo -e "${YELLOW}⚠️  No files found matching: $pattern ($description)${NC}"
    fi
}

echo "🔍 Cleaning application preferences..."
safe_remove "$HOME/Library/Preferences/${APP_ID}.plist" "Application preferences"

echo
echo "🔍 Cleaning application support data..."
safe_remove "$HOME/Library/Application Support/${APP_NAME}" "Application support directory"
safe_remove "$HOME/Library/Application Support/${APP_ID}" "Application support by ID"

echo
echo "🔍 Cleaning cache directories..."
safe_remove "$HOME/Library/Caches/${APP_ID}" "Application cache"
safe_remove "$HOME/Library/Caches/${APP_NAME}" "Application cache by name"

echo
echo "🔍 Cleaning recent documents..."
safe_remove "$HOME/Library/Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments/${APP_ID}.sfl4" "Recent documents (new format)"
safe_remove "$HOME/Library/Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments/${APP_ID}.sfl3" "Recent documents (old format)"

echo
echo "🔍 Cleaning related skytok applications recent documents..."
safe_remove "$HOME/Library/Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments/net.skytok.cherrystudio.sfl4" "CherryStudio recent documents"
safe_remove "$HOME/Library/Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments/ai.skytok.promstudio.sfl4" "PromStudio recent documents"
safe_remove "$HOME/Library/Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments/com.kangfenmao.cherrystudio.sfl4" "KangFenMao CherryStudio recent documents"
safe_remove "$HOME/Library/Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments/net.skytok.deepchat.sfl3" "DeepChat recent documents"

echo
echo "🔍 Cleaning WebKit data..."
safe_remove "$HOME/Library/WebKit/${APP_ID}" "WebKit data"

echo
echo "🔍 Cleaning saved application state..."
safe_remove "$HOME/Library/Saved Application State/${APP_ID}.savedState" "Saved application state"

echo
echo "🔍 Cleaning logs..."
safe_remove "$HOME/Library/Logs/${APP_NAME}" "Application logs"
safe_remove "$HOME/Library/Logs/${APP_ID}" "Application logs by ID"

echo
echo "🔍 Cleaning system placeholder caches..."
# Remove any skytok placeholder caches in daemon containers
find "$HOME/Library/Daemon Containers" -path "*/Data/Library/Caches/Placeholders-v6.noindex/net.skytok*" -exec rm -rf {} \; 2>/dev/null && echo -e "${GREEN}✅ Removed: System placeholder caches${NC}" || echo -e "${YELLOW}⚠️  No system placeholder caches found${NC}"

echo
echo "🔍 Cleaning any remaining KnowMe Studio files..."
remove_pattern "*${APP_ID}*" "remaining app ID files"
remove_pattern "*KnowMe Studio*" "remaining app name files"

echo
echo "🔍 Final verification..."
remaining_files=$(find "$HOME/Library" -name "*${APP_ID}*" -o -name "*KnowMe Studio*" 2>/dev/null | wc -l)
if [[ $remaining_files -eq 0 ]]; then
    echo -e "${GREEN}✅ All ${APP_NAME} files successfully removed!${NC}"
else
    echo -e "${YELLOW}⚠️  Found $remaining_files remaining files:${NC}"
    find "$HOME/Library" -name "*${APP_ID}*" -o -name "*KnowMe Studio*" 2>/dev/null
fi

echo
echo -e "${GREEN}🎉 Cleanup complete for ${APP_NAME}!${NC}"
echo -e "${YELLOW}💡 Note: You may need to restart your system or run the app to see fresh layouts and panels.${NC}"