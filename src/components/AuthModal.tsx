import { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Mail,
  Phone,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  Search,
  RefreshCw,
  CheckCircle2,
  KeyRound,
  Globe2,
  Lock,
  Trash2,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  Download,
  Upload,
} from 'lucide-react';
import {
  type MultiFactorResolver,
  type User,
} from 'firebase/auth';
import {
  signInWithGooglePopup,
  signInWithGoogleRedirectFallback,
  registerWithEmail,
  loginWithEmail,
  sendPasswordReset,
  clearPhoneRecaptcha,
  extractMultiFactorResolver,
  getEnrolledMfaFactors,
  upsertCreatorProfile,
  upsertPrivateInfo,
  reloadCurrentUser,
  logoutUser,
  type CreatorProfile,
  type CreatorPrivateInfo,
  type CreatorRole,
} from '../firebase';
import {
  GLOBAL_COUNTRY_DIAL_CODES,
  findCountryByDialCode,
  normalizeGlobalPhone,
  fetchVerificationCapabilities,
  dispatchPhoneVerificationCode,
  verifyServerOtpCode,
  dispatchEmailVerificationCode,
  dispatchMfaSignInSms,
  verifyMfaSignInSms,
  completePhoneMfaEnrollment,
  removePhoneMfaFactor,
  verifyRecaptchaAction,
  type CountryDialCode,
  type VerificationCapabilities,
  type VerificationChallengeState,
  type VerificationPurpose,
} from '../services/universalVerification';
import {
  createInteractiveSecurityChallenge,
  generateAdaptiveShieldProof,
  getMaskedRecaptchaSiteKey,
  preloadRecaptchaScript,
  type HumanChallengePrompt,
  type RecaptchaExecutionResult,
} from '../services/recaptchaSecurity';
import { getStudioHostname, getStudioOrigin, resolvePublicAsset } from '../assets/studioAssets';
import firebaseConfig from '../../firebase-applet-config.json';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  profile: CreatorProfile | null;
  privateInfo?: CreatorPrivateInfo | null;
  onProfileSaved: () => void;
}

type AuthTab = 'email' | 'google' | 'phone';

function evaluatePasswordStrength(pwd: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  barColor: string;
  textColor: string;
} {
  if (!pwd) {
    return { score: 0, label: 'Enter 6+ characters', barColor: 'bg-slate-700', textColor: 'text-slate-500' };
  }
  let score = 0;
  if (pwd.length >= 6) score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score++;

  const clamped = Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4;
  if (clamped === 1) {
    return { score: 1, label: 'Weak · Add uppercase & numbers', barColor: 'bg-red-500', textColor: 'text-red-400' };
  }
  if (clamped === 2) {
    return { score: 2, label: 'Fair · Longer password recommended', barColor: 'bg-amber-500', textColor: 'text-amber-400' };
  }
  if (clamped === 3) {
    return { score: 3, label: 'Good · Strong studio security', barColor: 'bg-emerald-500', textColor: 'text-emerald-400' };
  }
  return { score: 4, label: 'Strong · Maximum protection', barColor: 'bg-emerald-400', textColor: 'text-emerald-300' };
}

interface GlobalPhoneFieldProps {
  selectedCountry: CountryDialCode;
  rawPhoneInput: string;
  onSelectCountry: (country: CountryDialCode) => void;
  onChangePhoneInput: (value: string) => void;
  onSendCode: () => void;
  sending: boolean;
  cooldownSec: number;
  disabled?: boolean;
  sendLabel?: string;
}

function GlobalPhoneField({
  selectedCountry,
  rawPhoneInput,
  onSelectCountry,
  onChangePhoneInput,
  onSendCode,
  sending,
  cooldownSec,
  disabled,
  sendLabel = 'Send Code',
}: GlobalPhoneFieldProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const filteredCountries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return GLOBAL_COUNTRY_DIAL_CODES;
    return GLOBAL_COUNTRY_DIAL_CODES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.dialCode.slice(1).includes(q) ||
        c.iso.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const parsed = useMemo(
    () => normalizeGlobalPhone(rawPhoneInput, selectedCountry),
    [rawPhoneInput, selectedCountry]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-slate-400 flex items-center gap-1.5">
          <Globe2 className="w-3.5 h-3.5 text-amber-400" />
          <span>Global Phone Number (E.164 · All World Codes)</span>
        </label>
        <span className="text-[11px] font-mono text-slate-500">
          {selectedCountry.iso} ({selectedCountry.dialCode})
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex flex-1 min-w-0" ref={dropdownRef}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setDropdownOpen((o) => !o)}
            className="min-h-[42px] px-2.5 py-2 rounded-l-lg bg-[#161A22] hover:bg-[#1E2430] border border-r-0 border-[#232833] text-xs text-slate-100 flex items-center gap-1.5 shrink-0 transition-colors"
            aria-label="Select country dial code"
          >
            <span className="text-base leading-none">{selectedCountry.flag}</span>
            <span className="font-mono font-semibold text-amber-300">{selectedCountry.dialCode}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <input
            type="tel"
            disabled={disabled}
            value={rawPhoneInput}
            onChange={(e) => {
              const val = e.target.value;
              const check = normalizeGlobalPhone(val, selectedCountry);
              if (
                (val.trim().startsWith('+') || val.trim().startsWith('00')) &&
                check.country.iso !== selectedCountry.iso
              ) {
                onSelectCountry(check.country);
                onChangePhoneInput(check.nationalNumber);
              } else {
                onChangePhoneInput(val);
              }
            }}
            placeholder={selectedCountry.example || '142590695'}
            className="flex-1 min-w-0 min-h-[42px] px-3 py-2 rounded-r-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 font-mono focus:outline-none focus:border-amber-500"
          />

          {dropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 z-50 w-72 rounded-xl bg-[#13161B] border border-[#2A313E] shadow-2xl overflow-hidden">
              <div className="p-2 border-b border-[#232833] flex items-center gap-2 bg-[#0B0D10]">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search country, ISO, or +254..."
                  className="w-full bg-transparent text-xs text-slate-100 focus:outline-none placeholder:text-slate-500"
                />
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-[#1D222B]">
                {filteredCountries.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-slate-500 text-center">
                    No matching country code
                  </div>
                ) : (
                  filteredCountries.map((country) => {
                    const isSelected = country.iso === selectedCountry.iso;
                    return (
                      <button
                        key={`${country.iso}-${country.dialCode}`}
                        type="button"
                        onClick={() => {
                          onSelectCountry(country);
                          setDropdownOpen(false);
                          setSearchQuery('');
                        }}
                        className={`w-full px-3 py-2.5 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                          isSelected
                            ? 'bg-amber-500/15 text-amber-200'
                            : 'text-slate-200 hover:bg-[#1B2028]'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="text-sm">{country.flag}</span>
                          <span className="truncate">{country.name}</span>
                        </span>
                        <span className="font-mono text-amber-400 shrink-0">{country.dialCode}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onSendCode}
          disabled={disabled || sending || cooldownSec > 0 || !parsed.isValid}
          className="min-h-[42px] px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50 transition-colors"
        >
          <Phone className="w-3.5 h-3.5" />
          <span>
            {sending ? 'Sending...' : cooldownSec > 0 ? `Resend (${cooldownSec}s)` : sendLabel}
          </span>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        {rawPhoneInput.trim() ? (
          parsed.isValid ? (
            <span className="text-emerald-400 font-mono flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>E.164 Validated: {parsed.e164}</span>
            </span>
          ) : (
            <span className="text-amber-400">{parsed.error}</span>
          )
        ) : (
          <span className="text-slate-500">
            Format: {selectedCountry.dialCode}
            {selectedCountry.example || '712345678'} (or paste any +country number)
          </span>
        )}
      </div>
    </div>
  );
}

export function AuthModal({
  isOpen,
  onClose,
  user,
  profile,
  privateInfo,
  onProfileSaved,
}: AuthModalProps) {
  const [authTab, setAuthTab] = useState<AuthTab>('email');
  const [role, setRole] = useState<CreatorRole>(profile?.role || 'artist');
  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || '');
  const [buyMeSodaHandle, setBuyMeSodaHandle] = useState(profile?.buyMeSodaHandle || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [capabilities, setCapabilities] = useState<VerificationCapabilities | null>(null);

  // Global Phone + Firebase SMS MFA state
  const [phoneCountry, setPhoneCountry] = useState<CountryDialCode>(() =>
    findCountryByDialCode(privateInfo?.phoneCountryCode || '+254')
  );
  const [rawPhoneInput, setRawPhoneInput] = useState('');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneChallenge, setPhoneChallenge] = useState<VerificationChallengeState | null>(null);
  const [phoneCooldown, setPhoneCooldown] = useState(0);
  const [pendingVerifiedPhone, setPendingVerifiedPhone] = useState<string | null>(null);
  const [enrollPhoneAsMfa, setEnrollPhoneAsMfa] = useState(false);

  // Firebase Sign-In Multi-Factor Challenge Resolver state
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [mfaVerificationId, setMfaVerificationId] = useState<string | null>(null);
  const [mfaSignInCode, setMfaSignInCode] = useState('');

  // Email + Resend/SendGrid OTP + Password Strength + Reset state
  const [emailMode, setEmailMode] = useState<'register' | 'signin'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetModeOpen, setResetModeOpen] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailChallenge, setEmailChallenge] = useState<VerificationChallengeState | null>(null);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [emailCodeVerifiedFor, setEmailCodeVerifiedFor] = useState<string | null>(null);
  const [emailProofToken, setEmailProofToken] = useState<string | null>(null);

  // Adaptive Human Security Challenge fallback state
  const [recaptchaStatus, setRecaptchaStatus] = useState<
    RecaptchaExecutionResult['status'] | 'loading'
  >('loading');
  const [humanChallenge, setHumanChallenge] = useState<HumanChallengePrompt | null>(null);
  const [humanChallengeAnswer, setHumanChallengeAnswer] = useState('');
  const [humanChallengeVerified, setHumanChallengeVerified] = useState(false);
  const [showDomainTools, setShowDomainTools] = useState(false);
  const [showRedirectFallback, setShowRedirectFallback] = useState(false);

  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [copiedHost, setCopiedHost] = useState(false);
  const [copiedPublicLink, setCopiedPublicLink] = useState(false);
  const [copiedChallenge, setCopiedChallenge] = useState<string | null>(null);

  const currentStudioOrigin = getStudioOrigin();
  const currentStudioHost = getStudioHostname();

  const cleanupRecaptcha = () => {
    clearPhoneRecaptcha();
    if (recaptchaContainerRef.current) {
      recaptchaContainerRef.current.innerHTML = '';
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchVerificationCapabilities().then(setCapabilities);
    setRecaptchaStatus('loading');
    preloadRecaptchaScript().then(() => {
      verifyRecaptchaAction('auth_modal_open')
        .then((res) => setRecaptchaStatus(res.status))
        .catch(() => setRecaptchaStatus('shield_active'));
    });
  }, [isOpen]);

  useEffect(() => {
    return () => {
      clearPhoneRecaptcha();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (profile) {
      setRole(profile.role);
      setDisplayName(profile.displayName || user?.displayName || '');
      setBuyMeSodaHandle(profile.buyMeSodaHandle || '');
      setBio(profile.bio || '');
    } else if (user?.displayName) {
      setDisplayName(user.displayName);
    }

    const storedPhone = user?.phoneNumber || privateInfo?.phone || '';
    if (storedPhone) {
      const parsed = normalizeGlobalPhone(
        storedPhone,
        findCountryByDialCode(privateInfo?.phoneCountryCode || '+254')
      );
      setPhoneCountry(parsed.country);
      setRawPhoneInput(parsed.nationalNumber);
    }

    const storedEmail = user?.email || privateInfo?.email || '';
    if (storedEmail && !email) {
      setEmail(storedEmail);
    }
  }, [isOpen, profile, privateInfo, user]);

  useEffect(() => {
    if (phoneCooldown <= 0) return;
    const t = window.setInterval(() => {
      setPhoneCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [phoneCooldown]);

  useEffect(() => {
    if (emailCooldown <= 0) return;
    const t = window.setInterval(() => {
      setEmailCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [emailCooldown]);

  if (!isOpen) return null;

  const enrolledMfaFactors = getEnrolledMfaFactors(user);
  const parsedPhone = normalizeGlobalPhone(rawPhoneInput, phoneCountry);
  const activeEmailTarget = (user?.email || email).trim().toLowerCase();
  const isEmailVerified = Boolean(
    user?.emailVerified ||
      privateInfo?.emailVerified ||
      (activeEmailTarget && emailCodeVerifiedFor === activeEmailTarget)
  );
  const isPhoneVerified = Boolean(
    user?.phoneNumber ||
      privateInfo?.phoneVerified ||
      (parsedPhone.isValid && pendingVerifiedPhone === parsedPhone.e164)
  );
  const verifiedPhoneDisplay =
    user?.phoneNumber || (privateInfo?.phoneVerified ? privateInfo.phone : pendingVerifiedPhone);

  const passwordStrength = evaluatePasswordStrength(password);

  const formatAuthError = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err);

    // Unwrap JSON-serialized Firestore diagnostic error so users never see raw JSON dumps
    if (raw.startsWith('{') && raw.includes('"operationType"')) {
      try {
        const parsed = JSON.parse(raw) as { error?: string; operationType?: string };
        const inner = parsed.error || '';
        if (inner.toLowerCase().includes('permission')) {
          return 'Account authenticated, but cloud profile sync needs permission refresh. Your profile was saved locally.';
        }
        return inner || 'Cloud profile sync encountered a temporary connection issue.';
      } catch {
        // continue
      }
    }

    if (raw.includes('auth/email-already-in-use')) {
      return 'An account with this email already exists. Switch to Sign In or use Forgot Password.';
    }
    if (raw.includes('auth/invalid-credential') || raw.includes('auth/wrong-password')) {
      return 'Email or password is incorrect. Double-check your credentials or reset your password.';
    }
    if (raw.includes('auth/user-not-found')) {
      return 'No studio account exists for that email yet. Switch to Create Account to register.';
    }
    if (raw.includes('auth/weak-password')) {
      return 'Password is too weak. Use at least 6 characters with letters and numbers.';
    }
    if (raw.includes('auth/invalid-email')) {
      return 'Please enter a valid email address (e.g. artist@studio.com).';
    }
    if (raw.includes('auth/missing-password')) {
      return 'Please enter your password before submitting.';
    }
    if (raw.includes('auth/too-many-requests')) {
      return 'Too many attempts from this device. Wait a short moment or complete the Human Security Check below.';
    }
    if (raw.includes('auth/network-request-failed')) {
      return 'Network connection interrupted. Check your internet connection and retry.';
    }
    if (raw.includes('auth/account-exists-with-different-credential')) {
      return 'This email is already linked with another sign-in method (such as Google or Email/Password). Sign in with that method first.';
    }
    if (raw.includes('auth/operation-not-allowed')) {
      return 'This sign-in provider is not enabled yet in Firebase Console (Authentication > Sign-in method).';
    }
    if (raw.includes('auth/unauthorized-domain')) {
      return `Domain "${currentStudioHost}" must be added under Firebase Console > Project "${firebaseConfig.projectId}" > Authentication > Settings > Authorized domains.`;
    }
    if (raw.includes('auth/popup-closed-by-user') || raw.includes('auth/cancelled-popup-request')) {
      setShowRedirectFallback(true);
      return 'Sign-in popup was closed before completing. You can retry or use Redirect Sign-In below.';
    }
    if (raw.includes('auth/popup-blocked')) {
      setShowRedirectFallback(true);
      return 'Sign-in popup was blocked by your browser. Tap "Use Redirect Sign-In" below to sign in without popups.';
    }
    if (raw.includes('auth/invalid-phone-number')) {
      return 'Please enter a valid international phone number including country code (e.g. +254142590695).';
    }
    if (raw.includes('auth/invalid-verification-code')) {
      return 'The 6-digit verification code did not match. Double-check the code or request a new one.';
    }
    if (raw.includes('auth/code-expired')) {
      return 'That verification code has expired. Tap Send Code to receive a fresh code.';
    }
    if (raw.includes('auth/unverified-email')) {
      return 'Verify your email address first before enrolling SMS Multi-Factor Authentication.';
    }
    return raw;
  };

  /**
   * Syncs creator profile + private metadata to Firestore without crashing Auth sign-up/sign-in
   * if Firestore is offline or temporarily unavailable.
   */
  const syncProfileSafely = async (
    uid: string,
    profileData: {
      displayName: string;
      role: CreatorRole;
      buyMeSodaHandle?: string;
      bio?: string;
    },
    privateData?: Partial<Omit<CreatorPrivateInfo, 'uid'>>
  ): Promise<boolean> => {
    try {
      await upsertCreatorProfile(uid, profileData);
      if (privateData) {
        await upsertPrivateInfo(uid, privateData);
      }
      return true;
    } catch (syncErr) {
      console.warn('Profile cloud sync deferred to local backup:', syncErr);
      return false;
    }
  };

  const handleMfaRequiredError = async (err: unknown): Promise<boolean> => {
    const resolver = extractMultiFactorResolver(err);
    if (!resolver) return false;
    setMfaResolver(resolver);
    setMfaSignInCode('');
    try {
      const verId = await dispatchMfaSignInSms({
        resolver,
        hintIndex: 0,
        recaptchaContainerId: 'recaptcha-container-node',
        cleanupRecaptcha,
      });
      setMfaVerificationId(verId);
      setStatusMsg(
        '2FA SMS verification code sent to your enrolled phone. Enter the 6-digit code to finish signing in.'
      );
    } catch (smsErr) {
      setErrorMsg(formatAuthError(smsErr));
    }
    return true;
  };

  const handleCompleteMfaSignIn = async () => {
    if (!mfaResolver || !mfaVerificationId || mfaSignInCode.trim().length < 6) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const signedInUser = await verifyMfaSignInSms({
        resolver: mfaResolver,
        verificationId: mfaVerificationId,
        smsCode: mfaSignInCode.trim(),
      });
      await syncProfileSafely(
        signedInUser.uid,
        {
          displayName: displayName.trim() || signedInUser.displayName || 'Studio Creator',
          role,
          buyMeSodaHandle,
          bio,
        },
        {
          email: signedInUser.email || '',
          emailVerified: Boolean(signedInUser.emailVerified),
          mfaEnrolled: true,
        }
      );
      setMfaResolver(null);
      setMfaVerificationId(null);
      setMfaSignInCode('');
      onProfileSaved();
      setStatusMsg('Multi-factor verification succeeded and you are signed in.');
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setNoticeMsg(null);
    try {
      const sec = await verifyRecaptchaAction('google_signin');
      setRecaptchaStatus(sec.status);
      const signedInUser = await signInWithGooglePopup();
      const nameToUse = displayName.trim() || signedInUser.displayName || 'Studio Creator';
      const synced = await syncProfileSafely(
        signedInUser.uid,
        {
          displayName: nameToUse,
          role,
          buyMeSodaHandle,
          bio,
        },
        {
          email: signedInUser.email || '',
          emailVerified: Boolean(signedInUser.emailVerified),
          mfaEnrolled: getEnrolledMfaFactors(signedInUser).length > 0,
          ...(pendingVerifiedPhone
            ? {
                phone: pendingVerifiedPhone,
                phoneCountryCode: phoneCountry.dialCode,
                phoneVerified: true,
              }
            : {}),
        }
      );
      onProfileSaved();
      setStatusMsg(
        synced
          ? 'Signed in with Google and studio profile synced.'
          : 'Signed in with Google! Profile saved locally (cloud sync will retry automatically).'
      );
    } catch (err) {
      if (!(await handleMfaRequiredError(err))) {
        setErrorMsg(formatAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRedirect = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await signInWithGoogleRedirectFallback();
    } catch (err) {
      setErrorMsg(formatAuthError(err));
      setLoading(false);
    }
  };

  const handleSendPhoneCode = async (useMfaEnroll = false) => {
    if (!parsedPhone.isValid) {
      setErrorMsg(parsedPhone.error || 'Enter a valid global phone number.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setNoticeMsg(null);
    setPhoneChallenge(null);
    setEnrollPhoneAsMfa(useMfaEnroll);

    const purpose: VerificationPurpose = useMfaEnroll
      ? 'mfa_stepup'
      : user
      ? 'profile_verify'
      : 'registration';

    try {
      const result = await dispatchPhoneVerificationCode({
        e164Phone: parsedPhone.e164,
        countryName: phoneCountry.name,
        purpose,
        user,
        enrollMfa: useMfaEnroll,
        recaptchaContainerId: 'recaptcha-container-node',
        cleanupRecaptcha,
      });
      setPhoneChallenge(result.challenge);
      setPhoneCooldown(25);
      setStatusMsg(result.statusMessage);
      if (result.fallbackNotice) {
        setNoticeMsg(result.fallbackNotice);
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneCode = async () => {
    const cleanCode = phoneOtpCode.trim().replace(/\s+/g, '');
    if (!phoneChallenge || !cleanCode) {
      setErrorMsg('Send and enter the 6-digit phone verification code first.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setNoticeMsg(null);

    try {
      if (user && phoneChallenge.mode === 'firebase' && phoneChallenge.mfaVerificationId) {
        await completePhoneMfaEnrollment({
          user,
          verificationId: phoneChallenge.mfaVerificationId,
          smsCode: cleanCode,
          label: `${phoneCountry.name} (${phoneChallenge.target})`,
        });
        await syncProfileSafely(
          user.uid,
          {
            displayName: displayName.trim() || user.displayName || 'Studio Creator',
            role,
            buyMeSodaHandle,
            bio,
          },
          {
            phone: phoneChallenge.target,
            phoneCountryCode: phoneCountry.dialCode,
            phoneVerified: true,
            mfaEnrolled: true,
          }
        );
        setPendingVerifiedPhone(phoneChallenge.target);
        setPhoneChallenge(null);
        setPhoneOtpCode('');
        setEnrollPhoneAsMfa(false);
        onProfileSaved();
        setStatusMsg(`2FA SMS enrolled and ${phoneChallenge.target} verified via Firebase Auth!`);
        return;
      }

      if (phoneChallenge.mode === 'firebase' && phoneChallenge.firebaseConfirmation) {
        const cred = await phoneChallenge.firebaseConfirmation.confirm(cleanCode);
        const verifiedNumber = cred.user.phoneNumber || phoneChallenge.target;
        const nameToUse = displayName.trim() || cred.user.displayName || 'Phone Creator';
        await syncProfileSafely(
          cred.user.uid,
          {
            displayName: nameToUse,
            role,
            buyMeSodaHandle,
            bio,
          },
          {
            phone: verifiedNumber,
            phoneCountryCode: phoneCountry.dialCode,
            phoneVerified: true,
            mfaEnrolled: getEnrolledMfaFactors(cred.user).length > 0,
          }
        );
        setPendingVerifiedPhone(verifiedNumber);
        setPhoneChallenge(null);
        setPhoneOtpCode('');
        onProfileSaved();
        setStatusMsg(`Phone ${verifiedNumber} verified via Firebase Auth SMS!`);
        return;
      }

      const verified = await verifyServerOtpCode({
        channel: 'phone',
        target: phoneChallenge.target,
        code: cleanCode,
        purpose: phoneChallenge.purpose,
        challengeId: phoneChallenge.challengeId,
      });

      setPendingVerifiedPhone(verified.target);
      setPhoneChallenge(null);
      setPhoneOtpCode('');

      if (user) {
        await syncProfileSafely(
          user.uid,
          {
            displayName: displayName.trim() || user.displayName || 'Studio Creator',
            role,
            buyMeSodaHandle,
            bio,
          },
          {
            phone: verified.target,
            phoneCountryCode: phoneCountry.dialCode,
            phoneVerified: true,
          }
        );
        onProfileSaved();
        setStatusMsg(`Global phone number ${verified.target} verified and saved to your studio profile.`);
      } else {
        setStatusMsg(
          `Phone number ${verified.target} verified! Finish sign-in with Email or Google to bind this number to your studio account.`
        );
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUnenrollMfaFactor = async (factorUid: string) => {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await removePhoneMfaFactor(user, factorUid);
      const remaining = getEnrolledMfaFactors(user);
      await syncProfileSafely(
        user.uid,
        {
          displayName: displayName.trim() || user.displayName || 'Studio Creator',
          role,
          buyMeSodaHandle,
          bio,
        },
        {
          mfaEnrolled: remaining.length > 0,
        }
      );
      onProfileSaved();
      setStatusMsg('Removed 2FA phone factor from your account.');
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailCode = async () => {
    const targetEmail = (user?.email || email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(targetEmail)) {
      setErrorMsg('Please enter a valid email address first.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setNoticeMsg(null);

    const purpose: VerificationPurpose = user
      ? 'profile_verify'
      : emailMode === 'signin'
      ? 'signin'
      : 'registration';

    try {
      const result = await dispatchEmailVerificationCode({
        email: targetEmail,
        purpose,
        user,
      });
      setEmailChallenge(result.challenge);
      setEmailCooldown(25);
      setStatusMsg(result.statusMessage);
      if (result.challenge.gatewayWarning) {
        setNoticeMsg(result.challenge.gatewayWarning);
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    const cleanCode = emailOtpCode.trim().replace(/\s+/g, '');
    if (!emailChallenge || !cleanCode) {
      setErrorMsg('Send and enter the 6-digit email verification code first.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const verified = await verifyServerOtpCode({
        channel: 'email',
        target: emailChallenge.target,
        code: cleanCode,
        purpose: emailChallenge.purpose,
        challengeId: emailChallenge.challengeId,
      });

      setEmailCodeVerifiedFor(verified.target);
      setEmailProofToken(verified.proofToken);
      setEmailChallenge(null);
      setEmailOtpCode('');

      if (user) {
        await syncProfileSafely(
          user.uid,
          {
            displayName: displayName.trim() || user.displayName || 'Studio Creator',
            role,
            buyMeSodaHandle,
            bio,
          },
          {
            email: user.email || verified.target,
            emailVerified: true,
          }
        );
        onProfileSaved();
        setStatusMsg(`Email ${verified.target} verified via cryptographic 6-digit code!`);
      } else {
        setStatusMsg(
          `Email ${verified.target} verified! Enter your password below to complete ${
            emailMode === 'register' ? 'registration' : 'sign-in'
          }.`
        );
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshFirebaseEmailStatus = async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const refreshed = await reloadCurrentUser(user);
      if (refreshed.emailVerified) {
        await syncProfileSafely(
          refreshed.uid,
          {
            displayName: displayName.trim() || refreshed.displayName || 'Studio Creator',
            role,
            buyMeSodaHandle,
            bio,
          },
          {
            email: refreshed.email || '',
            emailVerified: true,
          }
        );
        onProfileSaved();
        setStatusMsg('Firebase confirmed your email verification link!');
      } else {
        setStatusMsg(
          'Firebase link confirmation still pending. You can verify immediately using a 6-digit email code above.'
        );
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSendPasswordReset = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setErrorMsg('Enter your registered email address above to receive a password reset link.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await verifyRecaptchaAction('password_reset');
      await sendPasswordReset(cleanEmail);
      setResetModeOpen(false);
      setStatusMsg(`Password reset email sent to ${cleanEmail}. Check your inbox or spam folder.`);
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setNoticeMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (emailMode === 'register' && password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Re-enter the same password in Confirm Password.');
      return;
    }

    setLoading(true);
    const alreadyCodeVerified = Boolean(emailCodeVerifiedFor === cleanEmail && emailProofToken);

    try {
      const sec = await verifyRecaptchaAction(
        emailMode === 'register' ? 'email_register' : 'email_signin'
      );
      setRecaptchaStatus(sec.status);

      if (emailMode === 'register') {
        const nameToUse = displayName.trim() || cleanEmail.split('@')[0] || 'Studio Creator';
        const newUser = await registerWithEmail(cleanEmail, password, nameToUse);
        const synced = await syncProfileSafely(
          newUser.uid,
          {
            displayName: nameToUse,
            role,
            buyMeSodaHandle,
            bio,
          },
          {
            email: newUser.email || cleanEmail,
            emailVerified: Boolean(newUser.emailVerified || alreadyCodeVerified),
            ...(pendingVerifiedPhone
              ? {
                  phone: pendingVerifiedPhone,
                  phoneCountryCode: phoneCountry.dialCode,
                  phoneVerified: true,
                }
              : {}),
          }
        );
        onProfileSaved();
        setPassword('');
        setConfirmPassword('');
        setStatusMsg(
          alreadyCodeVerified
            ? `Account created & email ${cleanEmail} verified! Studio profile synced.`
            : synced
            ? `Account created for ${newUser.email}! Firebase verification link sent.`
            : `Account created for ${newUser.email} and saved locally.`
        );
      } else {
        const existingUser = await loginWithEmail(cleanEmail, password);
        const synced = await syncProfileSafely(
          existingUser.uid,
          {
            displayName: displayName.trim() || existingUser.displayName || 'Studio Creator',
            role,
            buyMeSodaHandle,
            bio,
          },
          {
            email: existingUser.email || cleanEmail,
            emailVerified: Boolean(existingUser.emailVerified || alreadyCodeVerified),
            mfaEnrolled: getEnrolledMfaFactors(existingUser).length > 0,
            ...(pendingVerifiedPhone
              ? {
                  phone: pendingVerifiedPhone,
                  phoneCountryCode: phoneCountry.dialCode,
                  phoneVerified: true,
                }
              : {}),
          }
        );
        onProfileSaved();
        setPassword('');
        setStatusMsg(
          synced
            ? 'Signed in and studio profile synced.'
            : 'Signed in! Studio profile synced locally.'
        );
      }
    } catch (err) {
      if (!(await handleMfaRequiredError(err))) {
        setErrorMsg(formatAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const synced = await syncProfileSafely(user.uid, {
        displayName: displayName.trim() || user.displayName || 'Studio Creator',
        role,
        buyMeSodaHandle,
        bio,
      });
      onProfileSaved();
      setStatusMsg(
        synced
          ? 'Creator profile & BuymeSoda handle updated.'
          : 'Creator profile updated locally (cloud sync pending).'
      );
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await logoutUser();
      setStatusMsg(null);
      setNoticeMsg(null);
      setPhoneChallenge(null);
      setEmailChallenge(null);
      setMfaResolver(null);
      setMfaVerificationId(null);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyHumanChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!humanChallenge) return;
    if (humanChallengeAnswer.trim() !== humanChallenge.expectedAnswer) {
      setErrorMsg('Incorrect security check sum. Try again.');
      return;
    }
    await generateAdaptiveShieldProof('interactive_human_check', 'challenge');
    setHumanChallengeVerified(true);
    setHumanChallenge(null);
    setHumanChallengeAnswer('');
    setRecaptchaStatus('shield_active');
    setErrorMsg(null);
    setStatusMsg('Adaptive Human Security Shield verified for this session.');
  };

  const handleExportStudioBackup = () => {
    const payload = {
      app: 'SoundDeck Studio',
      exportedAt: new Date().toISOString(),
      origin: currentStudioOrigin,
      creatorProfile: {
        uid: user?.uid || 'local',
        displayName: displayName || user?.displayName || 'Studio Creator',
        role,
        buyMeSodaHandle,
        bio,
      },
      preferences: {
        deviceOverride: localStorage.getItem('sounddeck_device_override_v1'),
        developerUnlocked: localStorage.getItem('sounddeck_dev_unlocked_v1'),
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sounddeck-profile-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatusMsg('Exported portable Studio Profile backup (.json).');
  };

  const handleImportStudioBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as {
        creatorProfile?: Partial<CreatorProfile>;
      };
      if (parsed.creatorProfile) {
        if (parsed.creatorProfile.displayName) setDisplayName(parsed.creatorProfile.displayName);
        if (parsed.creatorProfile.role) setRole(parsed.creatorProfile.role);
        if (typeof parsed.creatorProfile.buyMeSodaHandle === 'string') {
          setBuyMeSodaHandle(parsed.creatorProfile.buyMeSodaHandle);
        }
        if (typeof parsed.creatorProfile.bio === 'string') setBio(parsed.creatorProfile.bio);
        setStatusMsg('Restored Studio Profile fields from backup. Click Save Studio Profile to sync.');
      }
    } catch {
      setErrorMsg('Invalid Studio backup file. Select a .json file exported from SoundDeck Studio.');
    }
  };

  const renderChallengeBanner = (
    challenge: VerificationChallengeState | null,
    channelLabel: 'Phone' | 'Email'
  ) => {
    if (!challenge || challenge.mode !== 'studio_challenge' || !challenge.challengeCode) {
      return null;
    }
    const isPhone = channelLabel === 'Phone';
    return (
      <div className="p-3 rounded-lg bg-amber-950/35 border border-amber-500/40 text-xs space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-amber-300 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" />
            <span>{channelLabel} Verification Code Challenge</span>
          </span>
          <span className="font-mono text-[11px] text-amber-200/80">Expires in 10m</span>
        </div>
        <div className="flex items-center justify-between gap-3 bg-[#0B0D10] border border-[#232833] rounded-md px-3 py-2">
          <div>
            <div className="text-[11px] text-slate-400">Single-use code for {challenge.target}</div>
            <div className="text-base font-mono font-bold tracking-[0.25em] text-amber-300">
              {challenge.challengeCode}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(challenge.challengeCode!);
              if (isPhone) {
                setPhoneOtpCode(challenge.challengeCode!);
              } else {
                setEmailOtpCode(challenge.challengeCode!);
              }
              setCopiedChallenge(challenge.challengeCode!);
              setTimeout(() => setCopiedChallenge(null), 1800);
            }}
            className="px-2.5 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0"
          >
            {copiedChallenge === challenge.challengeCode ? (
              <Check className="w-3 h-3 text-emerald-300" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span>{copiedChallenge === challenge.challengeCode ? 'Filled' : 'Use Code'}</span>
          </button>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {challenge.isLocalStaticChallenge
            ? 'Running in portable static mode: 6-digit verification is validated locally via Web Crypto.'
            : isPhone
            ? 'For live GSM carrier SMS, enable Phone Auth in Firebase Console (or configure TWILIO_* in Secrets).'
            : 'For live inbox OTP delivery, configure RESEND_API_KEY or SENDGRID_API_KEY in server Secrets.'}
        </p>
      </div>
    );
  };

  const activeEmailProviderBadge = capabilities?.staticHostingMode
    ? 'Portable Static + Firebase'
    : capabilities?.liveEmailProviders.resend
    ? 'Resend Live + Firebase'
    : capabilities?.liveEmailProviders.sendgrid
    ? 'SendGrid Live + Firebase'
    : 'Firebase Auth + Studio OTP';

  const shieldBadgeLabel =
    recaptchaStatus === 'verified'
      ? 'Google reCAPTCHA v3 Active'
      : humanChallengeVerified
      ? 'Human Shield Verified'
      : recaptchaStatus === 'loading'
      ? 'Checking Shield...'
      : 'Adaptive Shield Active';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Studio Account Registration"
    >
      <div className="w-full max-w-xl rounded-xl bg-[#13161B] border border-[#232833] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#232833]">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={resolvePublicAsset('app-logo.png')}
              alt="SoundDeck Studio logo"
              className="w-7 h-7 rounded-md object-cover border border-purple-500/40 shrink-0"
            />
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-100 leading-tight truncate">
                {user ? 'Creator Studio Profile & Security' : 'Creator Account & Security'}
              </h2>
              <div className="text-[11px] font-mono text-slate-400 truncate">
                {activeEmailProviderBadge} · E.164 Global SMS
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#1B2028] flex items-center justify-center transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/60 text-xs text-red-200 leading-relaxed space-y-2">
              <p>{errorMsg}</p>
              {(errorMsg.includes('Authorized domains') || errorMsg.includes('Firebase Console')) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(currentStudioHost);
                      setCopiedHost(true);
                      setTimeout(() => setCopiedHost(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-900/60 hover:bg-red-800/70 text-red-100 font-mono text-[11px] transition-colors"
                  >
                    {copiedHost ? (
                      <Check className="w-3 h-3 text-emerald-300" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedHost ? 'Copied Domain' : `Copy: ${currentStudioHost}`}</span>
                  </button>
                  <a
                    href={
                      errorMsg.includes('Authorized domains')
                        ? `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`
                        : `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium text-[11px] transition-colors"
                  >
                    <span>
                      {errorMsg.includes('Authorized domains')
                        ? 'Open Authorized Domains'
                        : 'Open Firebase Auth Providers'}
                    </span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {noticeMsg && (
            <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-700/50 text-xs text-amber-200 leading-relaxed flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{noticeMsg}</span>
            </div>
          )}

          {statusMsg && (
            <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-xs text-emerald-200 leading-relaxed">
              {statusMsg}
            </div>
          )}

          {/* Active Multi-Factor Sign-In Challenge Screen */}
          {mfaResolver && !user && (
            <div className="p-4 rounded-xl bg-[#0B0D10] border border-amber-500/50 space-y-3">
              <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold">
                <Lock className="w-4 h-4" />
                <span>Multi-Factor 2FA SMS Check Required</span>
              </div>
              <p className="text-xs text-slate-400">
                Enter the 6-digit SMS verification code sent to{' '}
                <span className="font-mono text-slate-200">
                  {(mfaResolver.hints[0] as { phoneNumber?: string })?.phoneNumber || 'your enrolled phone'}
                </span>
                .
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={mfaSignInCode}
                  onChange={(e) => setMfaSignInCode(e.target.value)}
                  placeholder="6-digit 2FA SMS code"
                  maxLength={6}
                  className="flex-1 min-h-[42px] px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-sm text-slate-100 font-mono tracking-widest focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleCompleteMfaSignIn}
                  disabled={loading || mfaSignInCode.trim().length < 6}
                  className="min-h-[42px] px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold whitespace-nowrap disabled:opacity-50"
                >
                  Verify 2FA
                </button>
              </div>
            </div>
          )}

          {/* Role & Studio Identity */}
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-400">
              Select your primary studio role
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'artist', label: 'Artist' },
                  { id: 'creator', label: 'Creator' },
                  { id: 'dj', label: 'Pro DJ' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRole(item.id)}
                  className={`min-h-[40px] py-2 px-3 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                    role === item.id
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-[#0B0D10] border-[#232833] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Stage / Creator Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. DJ Kairo"
                  maxLength={80}
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">BuymeSoda Handle</label>
                <input
                  type="text"
                  value={buyMeSodaHandle}
                  onChange={(e) => setBuyMeSodaHandle(e.target.value)}
                  placeholder="e.g. djkairo"
                  maxLength={80}
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {user ? (
            <div className="space-y-5 pt-2 border-t border-[#232833]">
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Creator Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder="Afrobeats producer, DJ, and short-form music creator..."
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 min-w-[160px] min-h-[42px] py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {loading ? 'Saving...' : 'Save Studio Profile'}
                  </button>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="min-h-[42px] py-2.5 px-3.5 rounded-lg bg-[#161A22] hover:bg-[#1E2430] text-amber-300 text-xs font-semibold border border-[#2A313E] transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    Switch Google
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={loading}
                    className="min-h-[42px] py-2.5 px-4 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-slate-200 text-sm font-medium border border-[#2A313E] transition-colors whitespace-nowrap"
                  >
                    Sign Out
                  </button>
                </div>
              </form>

              {/* Portable Profile Backup & Restore */}
              <div className="p-3.5 rounded-xl bg-[#0B0D10] border border-[#232833] flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs">
                  <div className="font-semibold text-slate-200">Portable Profile Backup</div>
                  <div className="text-[11px] text-slate-400">
                    Export or restore your studio identity across GitHub &amp; devices
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportStudioBackup}
                    className="px-3 py-1.5 rounded-lg bg-[#1B2028] hover:bg-[#252B36] border border-[#2A313E] text-xs text-amber-300 font-medium flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => backupFileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-[#1B2028] hover:bg-[#252B36] border border-[#2A313E] text-xs text-slate-200 font-medium flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Restore</span>
                  </button>
                  <input
                    ref={backupFileInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={handleImportStudioBackup}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Universal Multi-Factor Verification Center */}
              <div className="space-y-3 pt-3 border-t border-[#232833]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Universal MFA &amp; Verification Center
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                    <span
                      className={`px-2 py-0.5 rounded border ${
                        isEmailVerified
                          ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                          : 'bg-amber-950/40 border-amber-700/50 text-amber-300'
                      }`}
                    >
                      Email: {isEmailVerified ? 'Verified' : 'Pending'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded border ${
                        isPhoneVerified
                          ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      Phone: {isPhoneVerified ? 'Verified' : 'Unverified'}
                    </span>
                    {(enrolledMfaFactors.length > 0 || privateInfo?.mfaEnrolled) && (
                      <span className="px-2 py-0.5 rounded border bg-emerald-950/60 border-emerald-700/60 text-emerald-300">
                        2FA: Active
                      </span>
                    )}
                  </div>
                </div>

                {/* Email OTP Verification Card */}
                <div className="p-3.5 rounded-xl bg-[#0B0D10] border border-[#232833] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-200 min-w-0">
                      <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="truncate font-mono">
                        {user.email || privateInfo?.email || email || 'No email attached'}
                      </span>
                    </div>
                    {isEmailVerified ? (
                      <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verified</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSendEmailCode}
                        disabled={loading || emailCooldown > 0}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold whitespace-nowrap disabled:opacity-50"
                      >
                        {emailCooldown > 0 ? `Resend (${emailCooldown}s)` : 'Send Email Code'}
                      </button>
                    )}
                  </div>

                  {!user.email && (
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter email to verify (e.g. artist@studio.com)"
                      className="w-full px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  )}

                  {renderChallengeBanner(emailChallenge, 'Email')}

                  {emailChallenge && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={emailOtpCode}
                        onChange={(e) => setEmailOtpCode(e.target.value)}
                        placeholder="Enter 6-digit email code"
                        maxLength={6}
                        className="flex-1 px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-sm text-slate-100 font-mono tracking-widest focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyEmailCode}
                        disabled={loading || emailOtpCode.trim().length < 6}
                        className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold whitespace-nowrap disabled:opacity-50"
                      >
                        Verify Email
                      </button>
                    </div>
                  )}

                  {!isEmailVerified && user.email && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
                      <span>Verify via 6-digit code ({activeEmailProviderBadge})</span>
                      <button
                        type="button"
                        onClick={handleRefreshFirebaseEmailStatus}
                        disabled={loading}
                        className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Check Link Status</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Global Phone Verification & 2FA MFA Enrollment Card */}
                <div className="p-3.5 rounded-xl bg-[#0B0D10] border border-[#232833] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-200">
                      <UserCheck className="w-4 h-4 text-amber-400" />
                      <span>
                        {verifiedPhoneDisplay
                          ? `Verified Phone: ${verifiedPhoneDisplay}`
                          : 'Global Phone SMS & 2FA Protection'}
                      </span>
                    </div>
                    {isPhoneVerified && (
                      <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verified</span>
                      </span>
                    )}
                  </div>

                  <GlobalPhoneField
                    selectedCountry={phoneCountry}
                    rawPhoneInput={rawPhoneInput}
                    onSelectCountry={setPhoneCountry}
                    onChangePhoneInput={setRawPhoneInput}
                    onSendCode={() => handleSendPhoneCode(false)}
                    sending={loading}
                    cooldownSec={phoneCooldown}
                    sendLabel={isPhoneVerified ? 'Verify New Number' : 'Send SMS Code'}
                  />

                  {user.emailVerified && (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#1A1F28]">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Add as Firebase 2FA SMS second factor</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSendPhoneCode(true)}
                        disabled={loading || phoneCooldown > 0 || !parsedPhone.isValid}
                        className="px-2.5 py-1 rounded bg-[#1B2028] hover:bg-[#252B36] border border-[#2A313E] text-[11px] font-medium text-amber-300 whitespace-nowrap disabled:opacity-50"
                      >
                        {enrollPhoneAsMfa && loading ? 'Enrolling...' : 'Enroll 2FA SMS'}
                      </button>
                    </div>
                  )}

                  {enrolledMfaFactors.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] text-slate-400 font-medium">
                        Enrolled 2FA SMS Factors
                      </div>
                      {enrolledMfaFactors.map((factor) => (
                        <div
                          key={factor.uid}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#13161B] border border-[#232833] text-xs"
                        >
                          <span className="font-mono text-emerald-300">
                            {factor.displayName || 'Mobile 2FA'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUnenrollMfaFactor(factor.uid)}
                            disabled={loading}
                            className="text-slate-400 hover:text-red-400 p-1"
                            aria-label="Remove 2FA factor"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {renderChallengeBanner(phoneChallenge, 'Phone')}

                  {phoneChallenge && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={phoneOtpCode}
                        onChange={(e) => setPhoneOtpCode(e.target.value)}
                        placeholder="6-digit SMS verification code"
                        maxLength={6}
                        className="flex-1 px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-sm text-slate-100 font-mono tracking-widest focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyPhoneCode}
                        disabled={loading || phoneOtpCode.trim().length < 6}
                        className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold whitespace-nowrap disabled:opacity-50"
                      >
                        {enrollPhoneAsMfa ? 'Complete 2FA' : 'Verify Phone'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2 border-t border-[#232833]">
              {/* Primary Action Switcher: Create Account vs Sign In */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#0B0D10] border border-[#232833]">
                <button
                  type="button"
                  onClick={() => {
                    setEmailMode('register');
                    setResetModeOpen(false);
                    setErrorMsg(null);
                  }}
                  className={`min-h-[40px] py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    emailMode === 'register'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Create Account</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmailMode('signin');
                    setErrorMsg(null);
                  }}
                  className={`min-h-[40px] py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    emailMode === 'signin'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              </div>

              {/* Provider Selector */}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0D10] border border-[#232833]">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('email');
                    setErrorMsg(null);
                  }}
                  className={`flex-1 min-h-[38px] py-2 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    authTab === 'email'
                      ? 'bg-[#1B2028] text-amber-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Email &amp; Password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('google');
                    setErrorMsg(null);
                  }}
                  className={`flex-1 min-h-[38px] py-2 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    authTab === 'google'
                      ? 'bg-[#1B2028] text-amber-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Google
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('phone');
                    setErrorMsg(null);
                  }}
                  className={`flex-1 min-h-[38px] py-2 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    authTab === 'phone'
                      ? 'bg-[#1B2028] text-amber-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Phone SMS
                </button>
              </div>

              {authTab === 'email' && (
                <form onSubmit={handleEmailAuth} className="space-y-3">
                  <div className="space-y-2">
                    <label className="block text-xs text-slate-400">Studio Email Address</label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="artist@studio.com"
                        className="flex-1 min-w-0 min-h-[42px] px-3 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={handleSendEmailCode}
                        disabled={loading || emailCooldown > 0 || !email.includes('@')}
                        title="Optional instant 6-digit email verification check"
                        className="min-h-[42px] px-3.5 py-2 rounded-lg bg-[#1B2028] hover:bg-[#252B36] border border-[#2A313E] text-amber-300 text-xs font-semibold whitespace-nowrap disabled:opacity-50 transition-colors"
                      >
                        {emailCooldown > 0 ? `Resend (${emailCooldown}s)` : 'Verify Email'}
                      </button>
                    </div>

                    {emailCodeVerifiedFor && emailCodeVerifiedFor === email.trim().toLowerCase() && (
                      <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verified via cryptographic 6-digit code ({emailCodeVerifiedFor})</span>
                      </div>
                    )}
                  </div>

                  {renderChallengeBanner(emailChallenge, 'Email')}

                  {emailChallenge && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={emailOtpCode}
                        onChange={(e) => setEmailOtpCode(e.target.value)}
                        placeholder="6-digit email verification code"
                        maxLength={6}
                        className="flex-1 min-h-[42px] px-3 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 font-mono tracking-widest focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyEmailCode}
                        disabled={loading || emailOtpCode.trim().length < 6}
                        className="min-h-[42px] px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold whitespace-nowrap disabled:opacity-50"
                      >
                        Verify Code
                      </button>
                    </div>
                  )}

                  {!resetModeOpen && (
                    <>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-slate-400">Password</label>
                          {emailMode === 'signin' && (
                            <button
                              type="button"
                              onClick={() => setResetModeOpen(true)}
                              className="text-[11px] text-amber-400 hover:underline"
                            >
                              Forgot password?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            autoComplete={
                              emailMode === 'register' ? 'new-password' : 'current-password'
                            }
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password (6+ characters)"
                            className="w-full min-h-[42px] pl-3 pr-10 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((s) => !s)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        {emailMode === 'register' && (
                          <div className="space-y-1 pt-0.5">
                            <div className="grid grid-cols-4 gap-1">
                              {[1, 2, 3, 4].map((lvl) => (
                                <div
                                  key={lvl}
                                  className={`h-1 rounded-full transition-colors ${
                                    passwordStrength.score >= lvl
                                      ? passwordStrength.barColor
                                      : 'bg-[#232833]'
                                  }`}
                                />
                              ))}
                            </div>
                            <div className={`text-[11px] ${passwordStrength.textColor}`}>
                              {passwordStrength.label}
                            </div>
                          </div>
                        )}
                      </div>

                      {emailMode === 'register' && (
                        <div className="space-y-1">
                          <label className="text-xs text-slate-400">Confirm Password</label>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter password"
                            className={`w-full min-h-[42px] px-3 py-2 rounded-lg bg-[#0B0D10] border text-sm text-slate-100 focus:outline-none ${
                              confirmPassword && confirmPassword !== password
                                ? 'border-red-500'
                                : 'border-[#232833] focus:border-amber-500'
                            }`}
                          />
                          {confirmPassword && confirmPassword !== password && (
                            <div className="text-[11px] text-red-400">Passwords do not match</div>
                          )}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={
                          loading ||
                          (emailMode === 'register' &&
                            Boolean(confirmPassword) &&
                            confirmPassword !== password)
                        }
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <Mail className="w-4 h-4" />
                        <span>
                          {loading
                            ? 'Processing...'
                            : emailMode === 'register'
                            ? 'Create Studio Account'
                            : 'Sign In with Email'}
                        </span>
                      </button>
                    </>
                  )}

                  {resetModeOpen && (
                    <div className="p-3.5 rounded-xl bg-[#0B0D10] border border-amber-500/40 space-y-2.5">
                      <div className="text-xs font-semibold text-amber-300">
                        Reset Account Password
                      </div>
                      <p className="text-[11px] text-slate-400">
                        We will send a secure password reset link to{' '}
                        <span className="font-mono text-slate-200">{email || 'your email'}</span>.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSendPasswordReset}
                          disabled={loading || !email.includes('@')}
                          className="flex-1 min-h-[40px] px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold disabled:opacity-50"
                        >
                          {loading ? 'Sending...' : 'Send Reset Link'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetModeOpen(false)}
                          className="min-h-[40px] px-3 py-2 rounded-lg bg-[#1B2028] text-slate-300 text-xs border border-[#2A313E]"
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}

              {authTab === 'google' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Instant verified creator registration via Google OAuth with automatic Firebase MFA
                    support and redirect fallback for mobile apps or popup-blocked browsers.
                  </p>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="w-full min-h-[44px] py-3 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {loading
                        ? 'Connecting Google...'
                        : emailMode === 'register'
                        ? 'Register with Google'
                        : 'Sign In with Google'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleGoogleRedirect}
                    disabled={loading}
                    className={`w-full min-h-[40px] py-2 px-3 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] border text-xs font-medium transition-colors disabled:opacity-50 ${
                      showRedirectFallback
                        ? 'border-amber-500/60 text-amber-300'
                        : 'border-[#232833] text-slate-300'
                    }`}
                  >
                    Use Redirect Sign-In (Recommended if popup is blocked)
                  </button>
                </div>
              )}

              {authTab === 'phone' && (
                <div className="space-y-3">
                  <GlobalPhoneField
                    selectedCountry={phoneCountry}
                    rawPhoneInput={rawPhoneInput}
                    onSelectCountry={setPhoneCountry}
                    onChangePhoneInput={setRawPhoneInput}
                    onSendCode={() => handleSendPhoneCode(false)}
                    sending={loading}
                    cooldownSec={phoneCooldown}
                    sendLabel="Send SMS Code"
                  />

                  {pendingVerifiedPhone && (
                    <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-700/50 text-xs text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Verified Number Ready: {pendingVerifiedPhone}</span>
                    </div>
                  )}

                  {renderChallengeBanner(phoneChallenge, 'Phone')}

                  {phoneChallenge && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={phoneOtpCode}
                        onChange={(e) => setPhoneOtpCode(e.target.value)}
                        placeholder="6-digit SMS code"
                        maxLength={6}
                        className="flex-1 min-h-[42px] px-3 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 font-mono tracking-widest focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyPhoneCode}
                        disabled={loading || phoneOtpCode.trim().length < 6}
                        className="min-h-[42px] px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold whitespace-nowrap disabled:opacity-50"
                      >
                        Verify SMS
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Adaptive reCAPTCHA v3 + Human Security Shield & Dynamic Studio Deployment Bar */}
          <div className="p-3.5 rounded-xl bg-[#0B0D10] border border-[#232833] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-300">
                <ShieldCheck
                  className={`w-4 h-4 ${
                    recaptchaStatus === 'verified' || humanChallengeVerified
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                />
                <span>
                  Security Shield:{' '}
                  <strong className="font-mono text-slate-100">{getMaskedRecaptchaSiteKey()}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded font-mono border ${
                    recaptchaStatus === 'verified' || humanChallengeVerified
                      ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                      : 'bg-amber-950/40 border-amber-700/50 text-amber-300'
                  }`}
                >
                  {shieldBadgeLabel}
                </span>
                {recaptchaStatus !== 'verified' && !humanChallengeVerified && (
                  <button
                    type="button"
                    onClick={() => {
                      setHumanChallenge(createInteractiveSecurityChallenge());
                      setHumanChallengeAnswer('');
                    }}
                    className="text-amber-400 hover:underline font-medium"
                  >
                    Verify Human
                  </button>
                )}
              </div>
            </div>

            {humanChallenge && (
              <form
                onSubmit={handleVerifyHumanChallenge}
                className="p-2.5 rounded-lg bg-[#13161B] border border-amber-500/40 flex flex-col sm:flex-row sm:items-center gap-2"
              >
                <div className="flex-1 text-xs">
                  <div className="font-semibold text-amber-300">{humanChallenge.question}</div>
                  <div className="text-[11px] text-slate-400">{humanChallenge.hint}</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={humanChallengeAnswer}
                    onChange={(e) => setHumanChallengeAnswer(e.target.value)}
                    placeholder="Answer"
                    className="w-20 px-2.5 py-1.5 rounded bg-[#0B0D10] border border-[#232833] text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold"
                  >
                    Verify
                  </button>
                </div>
              </form>
            )}

            <div className="pt-2 border-t border-[#1D222B] space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-400 flex items-center gap-1.5 truncate">
                  <Globe2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate font-mono">{currentStudioOrigin || currentStudioHost}</span>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(currentStudioOrigin || currentStudioHost);
                      setCopiedPublicLink(true);
                      setTimeout(() => setCopiedPublicLink(false), 2000);
                    }}
                    className="text-amber-300 hover:underline inline-flex items-center gap-1"
                  >
                    {copiedPublicLink ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-300">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy URL</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDomainTools((v) => !v)}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    {showDomainTools ? 'Hide Setup' : 'Domain Setup'}
                  </button>
                </div>
              </div>

              {showDomainTools && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1">
                  <span>Add "{currentStudioHost}" to Firebase &amp; reCAPTCHA Admin if needed:</span>
                  <div className="flex items-center gap-3">
                    <a
                      href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:underline inline-flex items-center gap-1"
                    >
                      <span>Firebase Domains</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <a
                      href="https://www.google.com/recaptcha/admin"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:underline inline-flex items-center gap-1"
                    >
                      <span>reCAPTCHA Admin</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Persistent Invisible reCAPTCHA anchor for Phone SMS & Firebase MFA */}
          <div id="recaptcha-container-node" ref={recaptchaContainerRef} />
        </div>
      </div>
    </div>
  );
}
