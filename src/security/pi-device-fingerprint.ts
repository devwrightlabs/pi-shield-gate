import type { PiUid } from '../types/shield';

export interface DeviceFingerprint {
  userUid?: PiUid;
  platform: string;
  userAgent: string;
  language: string;
  timezone: string;
  hardwareConcurrency: number;
  deviceMemory?: number;
  screen: string;
  colorDepth: number;
  pixelRatio: number;
  webdriver: boolean;
  canvasHash: string;
  fingerprintHash: string;
}

export interface FingerprintRiskAssessment {
  riskScore: number;
  blocked: boolean;
  reasons: string[];
}

function hashHexFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return hashHexFromBuffer(digest);
}

function buildCanvasEntropy(): string {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return 'canvas-unavailable';
  }

  context.textBaseline = 'top';
  context.font = '14px Arial';
  context.fillStyle = '#f60';
  context.fillRect(0, 0, 200, 40);
  context.fillStyle = '#069';
  context.fillText('pi-shield-gate', 4, 4);
  context.fillStyle = 'rgba(102, 204, 0, 0.7)';
  context.fillText('entropy', 8, 20);

  return canvas.toDataURL();
}

/**
 * Captures stable browser/runtime metrics to identify emulator swarms.
 */
export async function createDeviceFingerprint(userUid?: PiUid): Promise<DeviceFingerprint> {
  const canvasEntropy = buildCanvasEntropy();
  const canvasHash = await sha256(canvasEntropy);

  const rawPayload = {
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hardwareConcurrency: navigator.hardwareConcurrency,
    screen: `${screen.width}x${screen.height}`,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio,
    webdriver: navigator.webdriver,
    canvasHash
  };
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

  const fingerprintHash = await sha256(
    JSON.stringify({
      ...rawPayload,
      ...(userUid !== undefined ? { userUid } : {}),
      ...(deviceMemory !== undefined ? { deviceMemory } : {})
    })
  );

  return {
    ...rawPayload,
    ...(userUid !== undefined ? { userUid } : {}),
    ...(deviceMemory !== undefined ? { deviceMemory } : {}),
    fingerprintHash
  };
}

/**
 * Evaluates fingerprint signals and blocks highly suspicious execution environments.
 */
export function evaluateFingerprintRisk(fingerprint: DeviceFingerprint): FingerprintRiskAssessment {
  const reasons: string[] = [];
  let score = 0;

  if (fingerprint.webdriver) {
    score += 45;
    reasons.push('Navigator webdriver flag is enabled.');
  }

  if (/HeadlessChrome|PhantomJS|Playwright/i.test(fingerprint.userAgent)) {
    score += 35;
    reasons.push('User agent indicates automation tooling.');
  }

  if (fingerprint.hardwareConcurrency <= 1) {
    score += 15;
    reasons.push('Extremely low CPU core count for production mobile webview.');
  }

  if (fingerprint.pixelRatio <= 0.5 || fingerprint.pixelRatio >= 5) {
    score += 10;
    reasons.push('Pixel ratio outside expected native mobile range.');
  }

  return {
    riskScore: score,
    blocked: score >= 50,
    reasons
  };
}
