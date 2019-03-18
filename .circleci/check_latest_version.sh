#!/usr/bin/env bash
# Stop script if error occurs
set -e
set -o pipefail

# Check to make sure the tag name doesn't already exist
version=`cat package.json | jq -r ".version"`

tag_name="v$version";

echo "package.json version is $version";
echo "Checking if release $tag_name already exists";
./check_is_new_release.sh;
if [ $? -ne 0 ]
then
    echo "Release $tag_name already exists, exiting.";
    exit 1;
fi
echo "Release doesn't exist yet!";

# Check the latest changelog version (grep doesn't always recognize '\d' so use '[0-9]' instead)
changelog_version=$(cat CHANGELOG.md | grep -E "^##[^#]" | grep -o -E "v[0-9]+.[0-9]+.[0-9]+" | head -n 1);
echo "Newest entry found in changelog is for $changelog_version";

if [[ "$changelog_version" != "$tag_name" ]]
then
    echo "Changelog for $tag_name doesn't exist. Update CHANGELOG.md.";
    exit 1;
fi

echo "Changelog is up to date!";
