const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function resolveReleaseVersion(currentVersion, args = []) {
  if (!stableVersionPattern.test(currentVersion)) throw new Error(`Invalid current version: ${currentVersion}`);
  const values = args[0] === '--' ? args.slice(1) : args;
  if (values.length > 1) throw new Error('Usage: pnpm run release [--] [major.minor.patch]');
  const current = currentVersion.split('.').map(BigInt);
  const nextVersion = values[0] ?? `${current[0]}.${current[1]}.${current[2] + 1n}`;
  if (!stableVersionPattern.test(nextVersion)) throw new Error(`Invalid version: ${nextVersion}`);
  const next = nextVersion.split('.').map(BigInt);
  const changedPart = next.findIndex((part, index) => part !== current[index]);
  if (changedPart >= 0 && next[changedPart] < current[changedPart]) {
    throw new Error(`Cannot release ${nextVersion} below ${currentVersion}: userscript managers require a newer version to update`);
  }
  // The same version may be retried after a failed deployment.
  return nextVersion;
}
