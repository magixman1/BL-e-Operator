# bl-operator

Mobile application for scanning, connecting to, and controlling Bluetooth Low Energy (BLE) smart devices and lights.

## Project Structure

```
bl-operator/
├── .github/
│   └── workflows/
│       └── build-apk.yml    # Automated cloud APK build workflow
├── .gitignore
├── app.json                 # Expo & Android BLE permissions configuration
├── App.js                   # Application UI, BLE scanner, and GATT controller
├── index.js                 # App entry point
├── package.json             # NPM dependencies and scripts
└── README.md
```

## How to Build the APK on GitHub Cloud

1. Initialize git and push this repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit for bl-operator"
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPOSITORY>.git
   git push -u origin main
   ```

2. Go to your repository on GitHub.
3. Click on the **Actions** tab.
4. Select **Build Android APK** from the left sidebar and click **Run workflow**.
5. Once the build finishes:
   - Under **Artifacts** at the bottom of the workflow run, download `bl-operator-debug-apk`.
   - If triggered via a Git tag (e.g. `git tag v1.0.0 && git push origin v1.0.0`), the APK is published directly as an asset on the **Releases** page.
