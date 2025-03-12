#!/bin/bash

# Get latest release notes based on commits
echo "Generating Release Notes..."

# Get the last tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null)

# Get commit messages since the last tag
if [ -n "$LAST_TAG" ]; then
  echo "Commits since last release ($LAST_TAG):"
  git log $LAST_TAG..HEAD --pretty=format:"- %s (%an)" > release-notes.md
else
  echo "No previous tag found. Listing all commits:"
  git log --pretty=format:"- %s (%an)" > release-notes.md
fi

echo "Release notes generated successfully!"
cat release-notes.md
