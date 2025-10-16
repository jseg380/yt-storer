#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
OUTPUT_BASENAME="yt-storer-package"

# List of files and folders to INCLUDE in the zip file.
FILES_TO_PACKAGE=(
  "manifest.json"
  "background.js"
  "icons"
  "popup"
  "options"
  "shared"
)

# List of patterns to EXCLUDE from the zip file.
# Use wildcards (*) to match multiple files or directories.
# These paths are relative to the project root.
EXCLUDE_PATTERNS=(
  # Example: Exclude a specific folder inside 'icons'.
  "icons/references/*"
  "icons/addons-mozilla-org/*"
  
  # Example: Exclude a specific source file you don't want to ship.
  "icons/yt-storer-logo.png"
  
  # Best practice: Exclude the build script itself and any previous packages.
  "compress.sh"
  "*.zip"
)
# --------------------

# --- Script Logic ---

# Generate a timestamp for the output file.
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ZIP_FILENAME="${OUTPUT_BASENAME}-${TIMESTAMP}.zip"

echo "Preparing to package the extension..."

# Pre-check: Ensure all specified files/folders to be included exist.
for item in "${FILES_TO_PACKAGE[@]}"; do
  if [ ! -e "$item" ]; then
    echo "ERROR: Required file or folder to include not found: $item"
    exit 1
  fi
done
echo "All required files are present."

# Build the exclusion arguments for the zip command.
EXCLUDE_ARGS=()
if [ ${#EXCLUDE_PATTERNS[@]} -gt 0 ]; then
    echo "The following patterns will be excluded:"
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        echo "  - $pattern"
        EXCLUDE_ARGS+=("-x" "$pattern")
    done
fi

echo "Creating archive: ${ZIP_FILENAME}"

# The Zip Command with Exclusions
# -r : Recurse into directories
# -q : Quiet mode
# "${EXCLUDE_ARGS[@]}" expands to: -x "pattern1" -x "pattern2" ...
zip -r -q "$ZIP_FILENAME" "${FILES_TO_PACKAGE[@]}" "${EXCLUDE_ARGS[@]}"

echo "-----------------------------------------------------"
echo "✅ Success! Package created at:"
echo "   ${ZIP_FILENAME}"
echo "-----------------------------------------------------"
