import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { ForgeConfig } from '@electron-forge/shared-types';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// Bundle and binary name the agent looks for:
//   yuka-agent-desktop-ui.app/Contents/MacOS/yuka-agent-desktop-ui
const APP_NAME = 'yuka-agent-desktop-ui';
// What the user sees in the Dock and the menu bar.
const DISPLAY_NAME = 'Юка';

const PROJECT_DIR = path.dirname(new URL(import.meta.url).pathname);
// Forge's intermediate output; the finished app is moved out of it.
const STAGING_DIR = path.join(PROJECT_DIR, 'out');
// Where `npm run build` leaves the ready-to-use app.
const RELEASE_DIR = path.join(PROJECT_DIR, 'release');

/** Moves the packaged app to release/<APP_NAME>.app and removes Forge's staging dir. */
function publishToRelease(outputPaths: string[]): void {
  const bundle = outputPaths
    .map((outputPath) => path.join(outputPath, `${APP_NAME}.app`))
    .find((candidate) => fs.existsSync(candidate));
  if (!bundle) throw new Error(`${APP_NAME}.app not found in ${outputPaths.join(', ')}`);

  const target = path.join(RELEASE_DIR, `${APP_NAME}.app`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  // A rename keeps the bundle byte-for-byte (symlinks, signature) – no copy involved.
  fs.renameSync(bundle, target);
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });

  console.log(`\n✔ Ready: ${target}`);
}

// @electron/packager overwrites CFBundleDisplayName from `name`, so the display name is
// applied after packaging and the bundle is re-signed (ad-hoc).
// CFBundleName must stay equal to APP_NAME: Electron locates "<CFBundleName> Helper.app"
// by it and aborts with "Unable to find helper app" otherwise.
function applyDisplayName(outputPaths: string[]): void {
  for (const outputPath of outputPaths) {
    const bundle = path.join(outputPath, `${APP_NAME}.app`);
    if (!fs.existsSync(bundle)) continue;

    const plist = path.join(bundle, 'Contents', 'Info.plist');
    execFileSync('plutil', ['-replace', 'CFBundleDisplayName', '-string', DISPLAY_NAME, plist]);
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', bundle]);
  }
}

// Bundling is done by Rsbuild (see rsbuild.config.mts); Forge only packages the result.
const config: ForgeConfig = {
  outDir: STAGING_DIR,
  packagerConfig: {
    name: APP_NAME,
    executableName: APP_NAME,
    appBundleId: 'com.yuka.agent.desktop-ui',
    appCategoryType: 'public.app-category.productivity',
    asar: true,
    // Ship only the bundled output and package.json – everything else is bundled in.
    ignore: (file: string) => file !== '' && file !== '/package.json' && !file.startsWith('/dist'),
  },
  rebuildConfig: {},
  hooks: {
    generateAssets: async () => {
      execFileSync('npx', ['rsbuild', 'build'], { stdio: 'inherit' });
    },
    postPackage: async (_forgeConfig, { platform, outputPaths }) => {
      if (platform === 'darwin') applyDisplayName(outputPaths);
      publishToRelease(outputPaths);
    },
  },
  makers: [],
  plugins: [
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
