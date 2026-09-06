#!/usr/bin/env bash
# Only run this on the fresh, disposable CI emulator, never a user's device.
set -euo pipefail
if [[ "${CI:-}" != "true" ]]; then
  echo "This setup requires a disposable CI emulator." >&2
  exit 1
fi
mkdir -p android-diagnostics
cleanup() {
  adb logcat -d -t 1000 > android-diagnostics/logcat.txt || true
  adb shell uiautomator dump /sdcard/window.xml || true
  adb pull /sdcard/window.xml android-diagnostics/window.xml || true
  adb exec-out screencap -p > android-diagnostics/screen.png || true
}
trap cleanup EXIT
adb root
adb wait-for-device
adb install "$RUNNER_TEMP/firefox.apk"
# Initialize app-owned files, then enable its documented USB-debugging preference.
adb shell am start -W -n org.mozilla.firefox/org.mozilla.fenix.HomeActivity
sleep 5
adb shell am force-stop org.mozilla.firefox
adb pull /data/user/0/org.mozilla.firefox/shared_prefs/fenix_preferences.xml "$RUNNER_TEMP/fenix_preferences.xml"
python3 - "$RUNNER_TEMP/fenix_preferences.xml" <<'PY'
import sys
import xml.etree.ElementTree as ET
path = sys.argv[1]
tree = ET.parse(path)
root = tree.getroot()
for name, value in [('pref_key_remote_debugging', 'true'), ('pref_key_telemetry', 'false')]:
    for old in list(root):
        if old.get('name') == name:
            root.remove(old)
    ET.SubElement(root, 'boolean', name=name, value=value)
tree.write(path, encoding='utf-8', xml_declaration=True)
PY
adb push "$RUNNER_TEMP/fenix_preferences.xml" /data/user/0/org.mozilla.firefox/shared_prefs/fenix_preferences.xml
FIREFOX_ANDROID=1 npm run test:firefox
