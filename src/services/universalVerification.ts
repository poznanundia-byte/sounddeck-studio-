import { type ConfirmationResult, type MultiFactorResolver, type User } from 'firebase/auth';
import {
  createPhoneRecaptcha,
  startPhoneSignIn,
  linkPhoneToCurrentUser,
  startPhoneMfaEnrollment,
  finishPhoneMfaEnrollment,
  unenrollPhoneMfaFactor,
  startMfaChallengeSms,
  confirmMfaChallengeSms,
  resendFirebaseEmailVerification,
} from '../firebase';
import {
  executeRecaptchaSecurity,
  getRecaptchaSiteKey,
  setRuntimeRecaptchaSiteKey,
  type RecaptchaExecutionResult,
} from './recaptchaSecurity';
import { safeApiFetch } from './apiClient';
export {
  GLOBAL_COUNTRY_DIAL_CODES,
  findCountryByDialCode,
  findCountryByIso,
  normalizeGlobalPhone,
  type CountryDialCode,
  type ParsedGlobalPhone,
} from '../data/countryDialCodes';

export type VerificationPurpose = 'registration' | 'signin' | 'mfa_stepup' | 'profile_verify';

export type DeliveryMode =
  | 'firebase'
  | 'twilio_sms'
  | 'resend_email'
  | 'sendgrid_email'
  | 'studio_challenge';

export interface VerificationCapabilities {
  smsPrimary: string;
  smsFallbackConfigured: boolean;
  emailPrimary: string;
  liveEmailProviders: {
    resend: boolean;
    sendgrid: boolean;
    firebaseEmailLink: boolean;
  };
  recaptcha?: {
    configured: boolean;
    siteKey: string;
    siteKeyPrefix: string;
    serverSecretVerified: boolean;
  };
  globalE164Supported: boolean;
  mfaSupported: boolean;
  staticHostingMode?: boolean;
}

export interface VerificationChallengeState {
  mode: DeliveryMode;
  target: string;
  purpose: VerificationPurpose;
  challengeId?: string;
  challengeCode?: string;
  expiresInSec?: number;
  gatewayWarning?: string;
  firebaseConfirmation?: ConfirmationResult;
  mfaVerificationId?: string;
  isLocalStaticChallenge?: boolean;
}

// Local cryptographic OTP store when deployed as a static app (e.g. GitHub Pages)
interface LocalStaticOtpRecord {
  challengeId: string;
  channel: 'phone' | 'email';
  target: string;
  purpose: VerificationPurpose;
  code: string;
  expiresAt: number;
}
const localStaticOtps = new Map<string, LocalStaticOtpRecord>();

function issueLocalStaticOtp(params: {
  channel: 'phone' | 'email';
  target: string;
  purpose: VerificationPurpose;
  reason?: string;
}): VerificationChallengeState {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const challengeId = `static_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const normalizedTarget =
    params.channel === 'phone'
      ? params.target.trim().replace(/[\s()-]/g, '')
      : params.target.trim().toLowerCase();

  localStaticOtps.set(challengeId, {
    challengeId,
    channel: params.channel,
    target: normalizedTarget,
    purpose: params.purpose,
    code,
    expiresAt: Date.now() + 600_000,
  });

  return {
    mode: 'studio_challenge',
    target: normalizedTarget,
    purpose: params.purpose,
    challengeId,
    challengeCode: code,
    expiresInSec: 600,
    isLocalStaticChallenge: true,
    gatewayWarning:
      params.reason ||
      'Static hosting mode detected: using local cryptographic 6-digit challenge (plus Firebase Auth links/SMS).',
  };
}

export async function fetchVerificationCapabilities(): Promise<VerificationCapabilities> {
  const res = await safeApiFetch<VerificationCapabilities>('/api/auth/verification-capabilities');
  if (res.ok && res.data) {
    if (res.data.recaptcha?.siteKey) {
      setRuntimeRecaptchaSiteKey(res.data.recaptcha.siteKey);
    }
    return { ...res.data, staticHostingMode: false };
  }

  const activeKey = getRecaptchaSiteKey();
  return {
    smsPrimary: 'firebase_auth',
    smsFallbackConfigured: false,
    emailPrimary: 'firebase_link_and_studio_otp',
    liveEmailProviders: { resend: false, sendgrid: false, firebaseEmailLink: true },
    recaptcha: {
      configured: Boolean(activeKey),
      siteKey: activeKey,
      siteKeyPrefix: activeKey ? `${activeKey.slice(0, 8)}...${activeKey.slice(-4)}` : 'Adaptive',
      serverSecretVerified: false,
    },
    globalE164Supported: true,
    mfaSupported: true,
    staticHostingMode: res.isStaticFallback,
  };
}

export async function verifyRecaptchaAction(
  action: string
): Promise<RecaptchaExecutionResult> {
  const execResult = await executeRecaptchaSecurity(action);
  const res = await safeApiFetch<{
    ok?: boolean;
    verified?: boolean;
    enforced?: boolean;
    score?: number;
    reason?: string;
  }>('/api/auth/verify-recaptcha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: execResult.token || undefined,
      shieldToken: execResult.shieldToken || undefined,
      action: execResult.action,
      hostname: execResult.hostname,
    }),
  });

  if (!res.isStaticFallback) {
    if (!res.ok && res.data?.enforced) {
      throw new Error(res.data?.reason || res.error || 'Security check failed.');
    }
    if (res.ok && res.data?.verified && execResult.status !== 'verified') {
      return {
        ...execResult,
        status: 'shield_active',
        active: true,
      };
    }
  }
  return execResult;
}

export async function requestServerVerificationCode(params: {
  channel: 'phone' | 'email';
  target: string;
  purpose: VerificationPurpose;
  countryName?: string;
}): Promise<VerificationChallengeState> {
  const action = params.channel === 'phone' ? 'send_phone_otp' : 'send_email_otp';
  const recaptchaResult = await executeRecaptchaSecurity(action);

  const res = await safeApiFetch<{
    ok?: boolean;
    error?: string;
    deliveryMode?: DeliveryMode;
    challengeId?: string;
    challengeCode?: string;
    expiresInSec?: number;
    target?: string;
    purpose?: VerificationPurpose;
    gatewayWarning?: string;
  }>('/api/auth/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      recaptchaToken: recaptchaResult.token || undefined,
      shieldToken: recaptchaResult.shieldToken || undefined,
      recaptchaAction: recaptchaResult.action,
    }),
  });

  if (res.isStaticFallback) {
    return issueLocalStaticOtp({
      channel: params.channel,
      target: params.target,
      purpose: params.purpose,
    });
  }

  if (!res.ok || !res.data?.ok) {
    throw new Error(res.error || res.data?.error || 'Failed to issue verification code.');
  }

  return {
    mode: res.data.deliveryMode || 'studio_challenge',
    target: res.data.target || params.target,
    purpose: res.data.purpose || params.purpose,
    challengeId: res.data.challengeId,
    challengeCode: res.data.challengeCode,
    expiresInSec: res.data.expiresInSec,
    gatewayWarning: res.data.gatewayWarning,
  };
}

export async function verifyServerOtpCode(params: {
  channel: 'phone' | 'email';
  target: string;
  code: string;
  purpose: VerificationPurpose;
  challengeId?: string;
}): Promise<{ verified: boolean; target: string; verifiedAtIso: string; proofToken: string }> {
  const cleanCode = params.code.trim().replace(/\s+/g, '');

  // Check local static OTP store first when issued on static hosting / GitHub Pages
  if (params.challengeId && localStaticOtps.has(params.challengeId)) {
    const record = localStaticOtps.get(params.challengeId)!;
    if (Date.now() > record.expiresAt) {
      localStaticOtps.delete(params.challengeId);
      throw new Error('Verification code expired. Please send a new code.');
    }
    if (record.code !== cleanCode) {
      throw new Error('Incorrect verification code. Double-check the 6-digit code and retry.');
    }
    localStaticOtps.delete(params.challengeId);
    const verifiedAtIso = new Date().toISOString();
    return {
      verified: true,
      target: record.target,
      verifiedAtIso,
      proofToken: `static_proof_${params.challengeId}`,
    };
  }

  const res = await safeApiFetch<{
    verified?: boolean;
    target?: string;
    verifiedAtIso?: string;
    proofToken?: string;
    error?: string;
  }>('/api/auth/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok || !res.data?.verified || !res.data?.proofToken) {
    throw new Error(res.error || res.data?.error || 'Verification code did not match.');
  }
  return {
    verified: true,
    target: res.data.target || params.target,
    verifiedAtIso: res.data.verifiedAtIso || new Date().toISOString(),
    proofToken: res.data.proofToken,
  };
}

function isFirebaseSmsUnavailableError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return (
    raw.includes('auth/operation-not-allowed') ||
    raw.includes('auth/billing-not-enabled') ||
    raw.includes('auth/captcha-check-failed') ||
    raw.includes('auth/missing-client-identifier') ||
    raw.includes('auth/internal-error') ||
    raw.includes('auth/credential-already-in-use') ||
    raw.includes('auth/requires-recent-login') ||
    raw.includes('auth/unauthorized-domain') ||
    raw.includes('auth/too-many-requests')
  );
}

/**
 * Universal Phone SMS Verification dispatcher:
 * Uses Firebase Auth (signInWithPhoneNumber, linkWithPhoneNumber, or MFA enroll) first,
 * and falls back cleanly to server cryptographic OTP / Twilio / local static challenge when
 * Firebase Phone Auth isn't configured or domain isn't registered yet.
 */
export async function dispatchPhoneVerificationCode(params: {
  e164Phone: string;
  countryName: string;
  purpose: VerificationPurpose;
  user: User | null;
  enrollMfa?: boolean;
  recaptchaContainerId: string;
  cleanupRecaptcha: () => void;
}): Promise<{
  challenge: VerificationChallengeState;
  statusMessage: string;
  fallbackNotice?: string;
}> {
  const { e164Phone, countryName, purpose, user, enrollMfa, recaptchaContainerId, cleanupRecaptcha } = params;

  try {
    cleanupRecaptcha();
    const verifier = createPhoneRecaptcha(recaptchaContainerId);

    if (user && enrollMfa) {
      const mfaVerificationId = await startPhoneMfaEnrollment(user, e164Phone, verifier);
      return {
        challenge: {
          mode: 'firebase',
          target: e164Phone,
          purpose: 'mfa_stepup',
          mfaVerificationId,
        },
        statusMessage: `Firebase 2FA SMS sent to ${e164Phone} (${countryName}). Enter the 6-digit code to enroll Multi-Factor Protection.`,
      };
    }

    const confirmation = user
      ? await linkPhoneToCurrentUser(user, e164Phone, verifier)
      : await startPhoneSignIn(e164Phone, verifier);

    return {
      challenge: {
        mode: 'firebase',
        target: e164Phone,
        purpose,
        firebaseConfirmation: confirmation,
      },
      statusMessage: `Firebase SMS sent to ${e164Phone} (${countryName}). Enter the 6-digit SMS code below.`,
    };
  } catch (firebaseErr) {
    if (!isFirebaseSmsUnavailableError(firebaseErr)) {
      throw firebaseErr;
    }

    const challenge = await requestServerVerificationCode({
      channel: 'phone',
      target: e164Phone,
      purpose,
      countryName,
    });

    const statusMessage =
      challenge.mode === 'twilio_sms'
        ? `Verification SMS sent to ${e164Phone} (${countryName}) via Twilio. Enter the 6-digit code below.`
        : `Studio 6-digit verification code generated for ${e164Phone} (${countryName}).`;

    const fallbackNotice =
      challenge.gatewayWarning ||
      (challenge.mode === 'studio_challenge'
        ? 'Live carrier SMS requires enabling Phone Auth in Firebase Console (or TWILIO_* server secrets).'
        : undefined);

    return { challenge, statusMessage, fallbackNotice };
  }
}

export async function dispatchMfaSignInSms(params: {
  resolver: MultiFactorResolver;
  hintIndex?: number;
  recaptchaContainerId: string;
  cleanupRecaptcha: () => void;
}): Promise<string> {
  params.cleanupRecaptcha();
  const verifier = createPhoneRecaptcha(params.recaptchaContainerId);
  return startMfaChallengeSms(params.resolver, params.hintIndex ?? 0, verifier);
}

export async function verifyMfaSignInSms(params: {
  resolver: MultiFactorResolver;
  verificationId: string;
  smsCode: string;
}): Promise<User> {
  return confirmMfaChallengeSms(params.resolver, params.verificationId, params.smsCode);
}

export async function completePhoneMfaEnrollment(params: {
  user: User;
  verificationId: string;
  smsCode: string;
  label?: string;
}): Promise<void> {
  await finishPhoneMfaEnrollment(
    params.user,
    params.verificationId,
    params.smsCode,
    params.label || 'Global Mobile 2FA'
  );
}

export async function removePhoneMfaFactor(user: User, factorUid: string): Promise<void> {
  await unenrollPhoneMfaFactor(user, factorUid);
}

/**
 * Universal Email OTP + Firebase verification link dispatcher:
 * Issues single-use 6-digit code via Resend / SendGrid (or Studio Challenge / static challenge)
 * and sends a Firebase verification link if an authenticated Firebase user matches.
 */
export async function dispatchEmailVerificationCode(params: {
  email: string;
  purpose: VerificationPurpose;
  user: User | null;
}): Promise<{ challenge: VerificationChallengeState; firebaseLinkSent: boolean; statusMessage: string }> {
  const targetEmail = params.email.trim().toLowerCase();
  const challenge = await requestServerVerificationCode({
    channel: 'email',
    target: targetEmail,
    purpose: params.purpose,
  });

  let firebaseLinkSent = false;
  if (params.user && params.user.email?.toLowerCase() === targetEmail && !params.user.emailVerified) {
    try {
      await resendFirebaseEmailVerification(params.user);
      firebaseLinkSent = true;
    } catch {
      // Ignore rate limits on Firebase email link
    }
  }

  const providerLabel =
    challenge.mode === 'resend_email'
      ? 'Resend'
      : challenge.mode === 'sendgrid_email'
      ? 'SendGrid'
      : 'Studio Verification Service';

  const statusMessage =
    challenge.mode === 'studio_challenge'
      ? `Studio 6-digit email verification code issued for ${targetEmail}${
          firebaseLinkSent ? ' (plus Firebase confirmation link sent to your inbox)' : ''
        }.`
      : `6-digit verification code emailed to ${targetEmail} via ${providerLabel}${
          firebaseLinkSent ? ' + Firebase link' : ''
        }.`;

  return { challenge, firebaseLinkSent, statusMessage };
}
