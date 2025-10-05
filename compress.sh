#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
# The base name for the output zip file.
OUTPUT_BASENAME="yt-storer-package"

# List of files and folders to include in the zip file.
# Add or remove items from this list as your project grows.
FILES_TO_PACKAGE=(
  "manifest.json"
  "background.js"
  "icons"
  "popup"
)
# --------------------

# Generate a timestamp in the format YYYYMMDD-HHMMSS
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ZIP_FILENAME="${OUTPUT_BASENAME}-${TIMESTAMP}.zip"

echo "Preparing to package the extension..."

# --- Pre-check: Ensure all specified files/folders exist ---
for item in "${FILES_TO_PACKAGE[@]}"; do
  if [ ! -e "$item" ]; then
    echo "ERROR: Required file or folder not found: $item"
    exit 1
  fi
done

echo "All required files are present."
echo "Creating archive: ${ZIP_FILENAME}"

# --- The Zip Command ---
# -r : Recurse into directories (to zip the contents of 'icons' and 'popup')
# -q : Quiet mode to prevent listing every single file
# The first argument is the output file name.
# The rest are the files/folders to be included.
zip -r -q "$ZIP_FILENAME" "${FILES_TO_PACKAGE[@]}"

echo "-----------------------------------------------------"
echo "✅ Success! Package created at:"
echo "   ${ZIP_FILENAME}"
echo "-----------------------------------------------------"
