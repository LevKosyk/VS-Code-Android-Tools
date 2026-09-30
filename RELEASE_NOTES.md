# Release 1.0.2

### Fixed
- Include runtime dependencies in the Marketplace VSIX so the extension activates and registers its project view commands.
- Verify packaged dependencies before publishing.
- Make CI tests independent of Windows line endings and use a Node version supported by the current VSIX packager.

### Changed
- Publish a new version automatically after successful CI on `main` when the package version increases.
