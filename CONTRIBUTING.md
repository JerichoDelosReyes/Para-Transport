# Contributing to Para Mobile

**Version 0.1.0 (Beta)**

This document outlines the contribution workflow and standards for the Para Mobile project.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Issue Guidelines](#issue-guidelines)
- [Issue Requirements](#issue-requirements)
- [Issue Templates](#issue-templates)
- [Pull Request Guidelines](#pull-request-guidelines)
- [External Contributors](#external-contributors)

---

## Code of Conduct

All contributors are expected to adhere to the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Development Setup


/ **To run the backend, download the Philippines PBF file from Geofabrik and place it in backend/data/**. /


For environment configuration, dependency installation, and backend setup instructions, refer to the [API Reference](docs/backend/api.reference.md).

## Installation
Note: You must have a BundleID ready `com.proj.name`, for now you may use your own bundle id from Firebase, just simply change it from app.json under the following: 
``` bash
   .../
      bundleIdentifier": "com.para.app", // change this from your downloaded Google plist
      "googleServicesFile": "./GoogleService-Info.plist" // this too
   .../
```



### Follow the steps to install all required modules and dependencies

1. Install NPM module
``` bash
npm install
```
> all dependencies installed will be based from package.json

2. iOS Native Simulator

**Make sure your XCode, and IOS configs are installed on your desktop for this to work.** 

* In order for the native compilation to run properly, you need to run this command:
``` bash
npx expo prebuild --platform ios --clean
```

this ensures that all required build are installed mainly on ios platform.

**Finally**, compile the ios build:
``` bash
npx expo run:ios
```
>this usually takes some time around ~10 - 15 minutes.
This may automatically run the IOS simulator, which may also cause an error. That is okay. close the server for now (`Ctrl+C`)

#### Once Done, open the XCode and open the existing repo:

**Remember**, iOS build may only be recognized through the `ios/` directory. ensure that the folder directory is under `ios/` folder not under root. 
**Quick Tip**: Just open the project from finder/folder; instead, from the IDE.

* Open the blue icon `Para` from the sidebar, and look for `General/Targets`. Make sure that the BundleID (com.project.name)should be the same in all essential folders (.plist, .json, app.json, etc.)

Then, to run, and show the simulator. Type in:
``` bash
npx expo start --dev-client -c

// type `i` in terminal once completed
```

other commands for testing the Mobile Platform:
``` bash
npx expo start --tunnel // assumed you used `npx expo run:ios --device` to compile to mobile app

3. Android Native Simulator
** Not yet in development **

---

## Issue Guidelines

> **⚠️ Before Submitting an Issue:** Please review the [Issues tab](https://github.com/your-org/para-mobile/issues) to verify that your issue has not already been reported or resolved. This helps prevent duplicate issues and ensures efficient triage.

All bug reports and feature requests **must** follow the appropriate format outlined in this document to ensure clarity, efficient delivery, and comprehensive understanding by maintainers and contributors.

---

## Issue Requirements

### All Issues must meet the following requirements:

- **Title**: Must include an appropriate tag prefix (see table below) followed by a concise, descriptive title.
- **Description**: Must use the provided templates (Bug or Feature) as described.
- **Metadata**: Complete metadata including tags, labels, and development status must be provided. Issues lacking complete metadata will be returned for revision.

### Title Tags

| Tag | Description |
| :--- | :--- |
| `[UI]` | UI issues pertaining to the whole app itself |
| `[MAPS]` | OSM bugs, errors, issues, incorrect details |
| `[BUG]` | Error messages, glitches (non-UI), API/Backend related |
| `[FEAT]` | New feature |
| `[FARE]` | Issues in terms of the fare |
| `[OTHERS]` | If none is selected yet |

### Description & Metadata

- All issue descriptions **must** use the templates provided in the [Issue Templates](#issue-templates) section below.
- Ensure complete metadata (tags, labels, development status) is provided to avoid revision requests.

> **📝 AI Disclaimer:** Use of AI to assist in writing issue descriptions is acceptable. However, please ensure thourough review that the generated content accurately reflects your original idea and intent before submission.

---

## Issue Templates

Please use the appropriate template below when submitting issues.

### Bug Report Template

```markdown
[type] bug title

## Summary
// A clear and concise description of what the bug is.

## Steps to Reproduce
Provide step-by-step instructions to replicate the bug.
1. [Step 1: e.g. Open the app]
2. [Step 2: e.g. Navigate to the login screen]
3. [Step 3: e.g. Click on the login button without entering credentials]

## Expected Behavior
// Explain what you expected to happen.

### Actual Behavior
// Explain what actually happened, including any error messages or unexpected outcomes.

### Environment
* **OS:** [e.g. iOS, Windows 10, macOS Ventura]
* **Browser/Version:** [e.g. Chrome 120, Firefox 121]
* **App Version:** [e.g. 1.0.0]

### Additional Information
// Add screenshots, logs, or other helpful details to further illustrate the problem. make sure that it is in Header 4 (####)
```

### Feature Request Template

```markdown
[Type] Feature request title

### Is your feature request related to a problem?
A clear and concise description of the problem this feature would solve (e.g., "I'm always frustrated when I have to...").

### Describe the Solution You'd Like
A clear and concise description of what you want to happen.

### Describe Alternatives You've Considered
A clear and concise description of any alternative solutions or features you've thought of.

### Additional Context
Add any other context or screenshots about the feature request here.
```

---

## Pull Request Guidelines

Direct commits to the `main` branch are prohibited. All changes must be submitted via Pull Request.

### PR Requirements

1. **Branching**: Create a feature or fix branch from `main`.
2. **Description**: All PRs **must** use the PR Overview format specified below.
3. **Metadata**: All PRs must include:
   - Appropriate labels
   - Linked milestone
   - Associated issue references (if applicable)
4. **Review**: PRs require approval before merging.

### PR Overview Template

All Pull Requests must include the following structure:

```markdown
# PR Overview
- **Summary**: [overview of this PR]
Related Issues/Context
Link to any relevant issues or tickets this PR addresses.
Fixes #(issue number) or Relates to #(issue number)
- **Actions Taken:** [Bulleted list of what was done]
- **Changes Made:** [Specific files modified]
- **Errors Resolved:** [Bugs fixed, if any]
- **Architectural Alignment:** [How this fits the Graph-Lite/Privacy blueprint]

## How Has This Been Tested?
Describe the tests that you ran to verify your changes. Provide instructions so reviewers can reproduce the results.
* Test environment (e.g., local, staging)
* Specific steps to test (e.g., "Run `npm test`, navigate to [URL] and check [feature]")

- **Value Delivered:** [Summary of the engineer's contribution]

Checklist
* [ ] My code follows the project's coding guidelines.
* [ ] I have performed a self-review of my own code.
* [ ] I have commented my code, particularly in hard-to-understand areas.
* [ ] I have updated the documentation where necessary.
* [ ] All tests pass.
* [ ] I have included screenshots or GIFs for UI changes (if applicable).
```


there might be some issues when running `npx expo run:ios`, if you encounter an error on ios, run this line on terminal `npx expo prebuild --platform ios --clean`, this ensures the following:
1. expo-build-properties — already installed (confirmed up to date)
2. app.json — correctly configured with the plugin:
3. Podfile.properties.json — confirmed the settings are applied:
* "ios.useFrameworks": "static" ✅
* "ios.buildReactNativeFromSource": "true" ✅
4. iOS project regenerated with npx expo prebuild --platform ios --clean
5. Build started — The compilation from source is in progress. 


---

## External Contributors

External contributors must adhere to the following workflow:

1. Fork the repository to your own GitHub account.
2. Create a feature branch in your fork.
3. Implement changes following the coding standards documented in the API Reference.
4. Open a Pull Request from your fork to the `main` branch of this repository.
5. Ensure all PR requirements listed above are satisfied.

---

## Questions

For questions regarding contribution procedures, open an issue with the `question` label.
