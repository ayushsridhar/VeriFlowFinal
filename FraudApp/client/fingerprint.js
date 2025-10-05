// Utility to load FingerprintJS and get the visitorId
export async function getDeviceFingerprint() {
  // Dynamically import the FingerprintJS library
  const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
  // Initialize an agent at application startup.
  const fp = await FingerprintJS.load();
  // Get the visitor identifier when needed.
  const result = await fp.get();
  return result.visitorId;
}
