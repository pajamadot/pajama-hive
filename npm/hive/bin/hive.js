#!/usr/bin/env node

const { execFileSync } = require("child_process");
const path = require("path");
const os = require("os");

const PLATFORMS = {
  "win32-x64": {
    package: "@pajamadot/hive-win32-x64",
    binary: "hive.exe",
  },
  "darwin-x64": {
    package: "@pajamadot/hive-darwin-x64",
    binary: "hive",
  },
  "darwin-arm64": {
    package: "@pajamadot/hive-darwin-arm64",
    binary: "hive",
  },
  "linux-x64": {
    package: "@pajamadot/hive-linux-x64",
    binary: "hive",
  },
};

function getBinaryPath() {
  const platform = os.platform();
  const arch = os.arch();
  const key = `${platform}-${arch}`;

  const config = PLATFORMS[key];
  if (!config) {
    console.error(
      `Unsupported platform: ${key}\n` +
        `Supported platforms: ${Object.keys(PLATFORMS).join(", ")}\n` +
        `You can build from source: https://github.com/PajamaDot/pajama-hive`
    );
    process.exit(1);
  }

  try {
    const pkgPath = require.resolve(`${config.package}/package.json`);
    return path.join(path.dirname(pkgPath), config.binary);
  } catch {
    console.error(
      `Could not find the binary for your platform (${key}).\n` +
        `The package ${config.package} may not have been installed.\n` +
        `Try reinstalling: npm install -g @pajamadot/hive\n` +
        `Or build from source: https://github.com/PajamaDot/pajama-hive`
    );
    process.exit(1);
  }
}

const binaryPath = getBinaryPath();
const args = process.argv.slice(2);

try {
  execFileSync(binaryPath, args, { stdio: "inherit" });
} catch (error) {
  if (error.status !== undefined) {
    process.exit(error.status);
  }
  throw error;
}
