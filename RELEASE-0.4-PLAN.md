# Release 0.4 plan — Firefox for Android

## Goal

Ship one extension package that works on Firefox Desktop and Firefox for
Android, while preserving the desktop-only Firefox History integration.

## Scope

### Platform compatibility

- Declare Android support with `browser_specific_settings.gecko_android`.
- Detect Android and optional WebExtension APIs at runtime.
- Keep Manifest V2 because Firefox for Android does not yet have full Manifest
  V3 feature parity.

### Feature adaptation

- Build the open-tabs view without `browser.windows` on Android.
- Activate tabs without trying to focus a desktop window on Android.
- Hide the Firefox History entry point when the History API is unavailable.
- Present Tracked pages as the Android history experience.
- Preserve visit tracking, duplicate closing, filtering, pagination, deletion,
  clearing, and CSV/JSON export.

### Mobile UI

- Use card layouts for tab, history, and tracked-page lists on narrow screens.
- Keep touch targets at least 44 px high.
- Make controls wrap cleanly without forcing horizontal page scrolling.

### Validation and delivery

- Add automated platform-capability tests.
- Run syntax, manifest, and `web-ext lint` checks.
- Test temporary installation on desktop Firefox.
- Document the remaining requirement for physical-device or emulator testing.
- Publish the implementation in a dedicated pull request.

## Acceptance criteria

- AMO recognizes the package as Android-compatible.
- No Android code path calls `browser.windows` or `browser.history`.
- Tracked pages persist across browser restarts.
- Explicit reloads increment visit counts.
- Private-window URLs are not stored.
- Tab filtering, activation, closing, and duplicate closing work on Android.
- Visit search, pagination, deletion, clearing, and export work on Android.
- Desktop tabs, windows, Firefox History, and visit tracking have no regression.

## Release checklist

- [x] Android capability layer implemented and tested.
- [x] Manifest version changed to `0.4`.
- [x] Mobile UI completed.
- [x] Automated checks and temporary installation on Firefox Desktop pass.
- [ ] Desktop manual regression tests pass.
- [ ] Firefox Android device/emulator tests pass.
- [x] README and roadmap updated.
- [ ] PR reviewed and merged.
- [ ] AMO package submitted and signed XPI attached to GitHub Release `v0.4`.
