import { initializeApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from 'firebase/app-check';
import {
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  linkWithPhoneNumber,
  multiFactor,
  getMultiFactorResolver,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  reload,
  signOut,
  updateProfile,
  type ConfirmationResult,
  type MultiFactorError,
  type MultiFactorResolver,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
function createResilientFirestore() {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          experimentalForceLongPolling: true,
          localCache: memoryLocalCache(),
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}
export const db = createResilientFirestore();
export const auth = getAuth(app);
export const storage = getStorage(app);

export const RECAPTCHA_SITE_KEY = (
  import.meta.env.VITE_RECAPTCHA_SITE_KEY ||
  firebaseConfig.recaptchaSiteKey ||
  '6Le3QyMuAAAAACqhl5z87UA-Lt99HEfcuC9rIcsa'
).trim();

let appCheckInstance: AppCheck | null = null;

export function initFirebaseAppCheck(): AppCheck | null {
  if (appCheckInstance || typeof window === 'undefined' || !RECAPTCHA_SITE_KEY) {
    return appCheckInstance;
  }
  const appCheckEnabled =
    import.meta.env.VITE_ENABLE_FIREBASE_APP_CHECK === 'true' ||
    Boolean(firebaseConfig.recaptchaSiteKey);
  if (!appCheckEnabled) {
    return null;
  }
  try {
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
    return appCheckInstance;
  } catch {
    return null;
  }
}

initFirebaseAppCheck();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export type CreatorRole = 'artist' | 'creator' | 'dj';

export interface CreatorProfile {
  uid: string;
  displayName: string;
  role: CreatorRole;
  buyMeSodaHandle?: string;
  bio?: string;
}

export interface CreatorPrivateInfo {
  uid: string;
  email?: string;
  phone?: string;
  phoneCountryCode?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  mfaEnrolled?: boolean;
  instagramHandle?: string;
  facebookPage?: string;
  tiktokHandle?: string;
  whatsappNumber?: string;
  youtubeChannel?: string;
}

export interface SavedMusicProject {
  id: string;
  ownerId: string;
  title: string;
  category?: 'beat' | 'recording' | 'song';
  genre: string;
  bpm: number;
  musicalKey?: string;
  timeSignature?: string;
  lyrics?: string;
  alignmentNotes?: string;
  kitName?: string;
  studioStateJson?: string;
  updatedAtMs?: number;
}

export interface SavedSocialCampaign {
  id: string;
  ownerId: string;
  platform: 'instagram' | 'facebook' | 'tiktok' | 'whatsapp' | 'youtube';
  headline: string;
  caption: string;
  trackTitle?: string;
}

export interface SodaSupportRecord {
  id: string;
  supporterId: string;
  supporterName: string;
  recipientHandle: string;
  recipientRole: 'artist' | 'creator' | 'dj' | 'owner';
  sodaCount: number;
  amountUsd: number;
  message?: string;
}

export interface PadSampleAssignment {
  id: string;
  ownerId: string;
  padId: string;
  sampleName: string;
  sourceType: 'catalog' | 'custom_audio';
  sourceTrackId: string;
  grooveStyle: 'afro' | 'house' | 'trap';
  bpm: number;
  sliceStartSec: number;
  sliceDurationSec: number;
  audioBase64?: string;
}

// Auth helpers
export async function signInWithGooglePopup(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  const res = await signInWithPopup(auth, provider);
  return res.user;
}

export async function signInWithGoogleRedirectFallback(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  await signInWithRedirect(auth, provider);
}

export async function resolveGoogleRedirectSignIn(): Promise<User | null> {
  try {
    const res = await getRedirectResult(auth);
    return res?.user ?? null;
  } catch {
    return null;
  }
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName.trim()) {
    try {
      await updateProfile(cred.user, { displayName: displayName.trim().slice(0, 80) });
    } catch {
      // Non-fatal
    }
  }
  try {
    await sendEmailVerification(cred.user);
  } catch {
    // Non-fatal: allow user to proceed even if verification email rate-limits
  }
  return cred.user;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

let activePhoneRecaptchaVerifier: RecaptchaVerifier | null = null;

export function clearPhoneRecaptcha(): void {
  if (activePhoneRecaptchaVerifier) {
    try {
      activePhoneRecaptchaVerifier.clear();
    } catch {
      // ignore stale verifier clear error
    }
    activePhoneRecaptchaVerifier = null;
  }
}

export function createPhoneRecaptcha(containerId: string): RecaptchaVerifier {
  clearPhoneRecaptcha();
  const host = document.getElementById(containerId);
  let targetIdOrElement: string | HTMLElement = containerId;
  if (host) {
    host.innerHTML = '';
    const slot = document.createElement('div');
    slot.id = `${containerId}_slot_${Date.now()}`;
    host.appendChild(slot);
    targetIdOrElement = slot;
  }
  const verifier = new RecaptchaVerifier(auth, targetIdOrElement, { size: 'invisible' });
  activePhoneRecaptchaVerifier = verifier;
  return verifier;
}

export async function startPhoneSignIn(
  phoneNumber: string,
  verifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(auth, phoneNumber, verifier);
}

export async function linkPhoneToCurrentUser(
  user: User,
  phoneNumber: string,
  verifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  return linkWithPhoneNumber(user, phoneNumber, verifier);
}

export async function resendFirebaseEmailVerification(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export async function reloadCurrentUser(user: User): Promise<User> {
  await reload(user);
  return auth.currentUser || user;
}

export async function startPhoneMfaEnrollment(
  user: User,
  phoneNumber: string,
  verifier: RecaptchaVerifier
): Promise<string> {
  const session = await multiFactor(user).getSession();
  const phoneAuthProvider = new PhoneAuthProvider(auth);
  return phoneAuthProvider.verifyPhoneNumber({ phoneNumber, session }, verifier);
}

export async function finishPhoneMfaEnrollment(
  user: User,
  verificationId: string,
  smsCode: string,
  displayName = 'Mobile 2FA'
): Promise<void> {
  const cred = PhoneAuthProvider.credential(verificationId, smsCode);
  const assertion = PhoneMultiFactorGenerator.assertion(cred);
  await multiFactor(user).enroll(assertion, displayName);
}

export async function unenrollPhoneMfaFactor(user: User, factorUid: string): Promise<void> {
  await multiFactor(user).unenroll(factorUid);
}

export function getEnrolledMfaFactors(user: User | null) {
  if (!user) return [];
  try {
    return multiFactor(user).enrolledFactors || [];
  } catch {
    return [];
  }
}

export function extractMultiFactorResolver(error: unknown): MultiFactorResolver | null {
  try {
    const code = (error as { code?: string })?.code;
    if (code === 'auth/multi-factor-auth-required') {
      return getMultiFactorResolver(auth, error as MultiFactorError);
    }
  } catch {
    // ignore
  }
  return null;
}

export async function startMfaChallengeSms(
  resolver: MultiFactorResolver,
  hintIndex: number,
  verifier: RecaptchaVerifier
): Promise<string> {
  const hint = resolver.hints[hintIndex] || resolver.hints[0];
  if (!hint) {
    throw new Error('No enrolled MFA phone factor available.');
  }
  const phoneAuthProvider = new PhoneAuthProvider(auth);
  return phoneAuthProvider.verifyPhoneNumber(
    { multiFactorHint: hint, session: resolver.session },
    verifier
  );
}

export async function confirmMfaChallengeSms(
  resolver: MultiFactorResolver,
  verificationId: string,
  smsCode: string
): Promise<User> {
  const cred = PhoneAuthProvider.credential(verificationId, smsCode);
  const assertion = PhoneMultiFactorGenerator.assertion(cred);
  const res = await resolver.resolveSignIn(assertion);
  return res.user;
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

// Firestore profile & private info (with local backup resilience for offline / static deploys)
export function saveLocalProfileBackup(uid: string, profile: CreatorProfile): void {
  try {
    localStorage.setItem(`sounddeck_profile_${uid}`, JSON.stringify(profile));
  } catch {
    // Ignore quota errors
  }
}

export function getLocalProfileBackup(uid: string): CreatorProfile | null {
  try {
    const raw = localStorage.getItem(`sounddeck_profile_${uid}`);
    if (!raw) return null;
    return JSON.parse(raw) as CreatorProfile;
  } catch {
    return null;
  }
}

export async function upsertCreatorProfile(
  uid: string,
  data: {
    displayName: string;
    role: CreatorRole;
    buyMeSodaHandle?: string;
    bio?: string;
  }
): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const safeName = data.displayName.trim().slice(0, 80) || 'Creator';
  const safeSoda = (data.buyMeSodaHandle || '').trim().slice(0, 80);
  const safeBio = (data.bio || '').trim().slice(0, 300);

  saveLocalProfileBackup(uid, {
    uid,
    displayName: safeName,
    role: data.role,
    buyMeSodaHandle: safeSoda,
    bio: safeBio,
  });

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        displayName: safeName,
        role: data.role,
        buyMeSodaHandle: safeSoda,
        bio: safeBio,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid,
        displayName: safeName,
        role: data.role,
        buyMeSodaHandle: safeSoda,
        bio: safeBio,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getCreatorProfile(uid: string): Promise<CreatorProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: d.uid,
      displayName: d.displayName,
      role: d.role,
      buyMeSodaHandle: d.buyMeSodaHandle,
      bio: d.bio,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function upsertPrivateInfo(
  uid: string,
  info: Partial<Omit<CreatorPrivateInfo, 'uid'>>
): Promise<void> {
  const path = `users/${uid}/private/info`;
  const ref = doc(db, 'users', uid, 'private', 'info');
  try {
    const snap = await getDoc(ref);
    const prev = snap.exists() ? snap.data() : {};
    await setDoc(ref, {
      uid,
      email: (info.email ?? prev.email ?? '').slice(0, 160),
      phone: (info.phone ?? prev.phone ?? '').slice(0, 40),
      phoneCountryCode: (info.phoneCountryCode ?? prev.phoneCountryCode ?? '').slice(0, 10),
      emailVerified: Boolean(info.emailVerified ?? prev.emailVerified ?? false),
      phoneVerified: Boolean(info.phoneVerified ?? prev.phoneVerified ?? false),
      mfaEnrolled: Boolean(info.mfaEnrolled ?? prev.mfaEnrolled ?? false),
      instagramHandle: (info.instagramHandle ?? prev.instagramHandle ?? '').slice(0, 80),
      facebookPage: (info.facebookPage ?? prev.facebookPage ?? '').slice(0, 120),
      tiktokHandle: (info.tiktokHandle ?? prev.tiktokHandle ?? '').slice(0, 80),
      whatsappNumber: (info.whatsappNumber ?? prev.whatsappNumber ?? '').slice(0, 40),
      youtubeChannel: (info.youtubeChannel ?? prev.youtubeChannel ?? '').slice(0, 120),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getPrivateInfo(uid: string): Promise<CreatorPrivateInfo | null> {
  const path = `users/${uid}/private/info`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: d.uid,
      email: d.email,
      phone: d.phone,
      phoneCountryCode: d.phoneCountryCode,
      emailVerified: Boolean(d.emailVerified),
      phoneVerified: Boolean(d.phoneVerified),
      mfaEnrolled: Boolean(d.mfaEnrolled),
      instagramHandle: d.instagramHandle,
      facebookPage: d.facebookPage,
      tiktokHandle: d.tiktokHandle,
      whatsappNumber: d.whatsappNumber,
      youtubeChannel: d.youtubeChannel,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export interface SocialSyncConfig {
  autoPublishTracks: boolean;
  autoPublishReels: boolean;
  includeSodaCard: boolean;
  instagramEnabled: boolean;
  tiktokEnabled: boolean;
  soundcloudEnabled: boolean;
  facebookEnabled: boolean;
  whatsappEnabled: boolean;
  youtubeEnabled: boolean;
  soundcloudHandle: string;
  youtubeChannel: string;
}

export const DEFAULT_SOCIAL_SYNC_CONFIG: SocialSyncConfig = {
  autoPublishTracks: true,
  autoPublishReels: true,
  includeSodaCard: true,
  instagramEnabled: true,
  tiktokEnabled: true,
  soundcloudEnabled: true,
  facebookEnabled: true,
  whatsappEnabled: true,
  youtubeEnabled: true,
  soundcloudHandle: '',
  youtubeChannel: '',
};

export async function upsertSocialSyncConfig(
  uid: string,
  config: SocialSyncConfig
): Promise<void> {
  const path = `users/${uid}/private/social_sync`;
  const ref = doc(db, 'users', uid, 'private', 'social_sync');
  try {
    await setDoc(ref, {
      uid,
      autoPublishTracks: Boolean(config.autoPublishTracks),
      autoPublishReels: Boolean(config.autoPublishReels),
      includeSodaCard: Boolean(config.includeSodaCard),
      instagramEnabled: Boolean(config.instagramEnabled),
      tiktokEnabled: Boolean(config.tiktokEnabled),
      soundcloudEnabled: Boolean(config.soundcloudEnabled),
      facebookEnabled: Boolean(config.facebookEnabled),
      whatsappEnabled: Boolean(config.whatsappEnabled),
      youtubeEnabled: Boolean(config.youtubeEnabled),
      soundcloudHandle: (config.soundcloudHandle || '').trim().slice(0, 80),
      youtubeChannel: (config.youtubeChannel || '').trim().slice(0, 120),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeSocialSyncConfig(
  uid: string,
  onData: (config: SocialSyncConfig | null) => void
): Unsubscribe {
  const path = `users/${uid}/private/social_sync`;
  const ref = doc(db, 'users', uid, 'private', 'social_sync');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const d = snap.data();
      onData({
        autoPublishTracks: Boolean(d.autoPublishTracks),
        autoPublishReels: Boolean(d.autoPublishReels),
        includeSodaCard: Boolean(d.includeSodaCard),
        instagramEnabled: Boolean(d.instagramEnabled),
        tiktokEnabled: Boolean(d.tiktokEnabled),
        soundcloudEnabled: Boolean(d.soundcloudEnabled),
        facebookEnabled: Boolean(d.facebookEnabled),
        whatsappEnabled: Boolean(d.whatsappEnabled),
        youtubeEnabled: d.youtubeEnabled === undefined ? true : Boolean(d.youtubeEnabled),
        soundcloudHandle: typeof d.soundcloudHandle === 'string' ? d.soundcloudHandle : '',
        youtubeChannel: typeof d.youtubeChannel === 'string' ? d.youtubeChannel : '',
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function saveMusicProject(
  ownerId: string,
  payload: {
    title: string;
    category?: 'beat' | 'recording' | 'song';
    genre: string;
    bpm: number;
    musicalKey?: string;
    timeSignature?: string;
    lyrics?: string;
    alignmentNotes?: string;
    kitName?: string;
    studioStateJson?: string;
  }
): Promise<string> {
  const path = 'projects';
  try {
    const docData: Record<string, unknown> = {
      ownerId,
      title: payload.title.trim().slice(0, 120) || 'Untitled Studio Session',
      category: payload.category || 'song',
      genre: payload.genre.trim().slice(0, 60) || 'Afrobeat',
      bpm: Math.min(240, Math.max(40, Number(payload.bpm) || 112)),
      musicalKey: (payload.musicalKey || 'A minor').slice(0, 32),
      timeSignature: (payload.timeSignature || '4/4').slice(0, 16),
      lyrics: (payload.lyrics || '').slice(0, 8000),
      alignmentNotes: (payload.alignmentNotes || '').slice(0, 4000),
      kitName: (payload.kitName || '').slice(0, 60),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (payload.studioStateJson) {
      docData.studioStateJson = payload.studioStateJson.slice(0, 120000);
    }
    const docRef = await addDoc(collection(db, 'projects'), docData);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateMusicProject(
  projectId: string,
  payload: Partial<{
    title: string;
    category: 'beat' | 'recording' | 'song';
    genre: string;
    bpm: number;
    musicalKey: string;
    timeSignature: string;
    lyrics: string;
    alignmentNotes: string;
    kitName: string;
    studioStateJson: string;
  }>
): Promise<void> {
  const path = `projects/${projectId}`;
  try {
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (payload.title !== undefined) patch.title = payload.title.trim().slice(0, 120) || 'Untitled Project';
    if (payload.category !== undefined) patch.category = payload.category;
    if (payload.genre !== undefined) patch.genre = payload.genre.trim().slice(0, 60) || 'Afrobeat';
    if (payload.bpm !== undefined) patch.bpm = Math.min(240, Math.max(40, Number(payload.bpm) || 112));
    if (payload.musicalKey !== undefined) patch.musicalKey = payload.musicalKey.slice(0, 32);
    if (payload.timeSignature !== undefined) patch.timeSignature = payload.timeSignature.slice(0, 16);
    if (payload.lyrics !== undefined) patch.lyrics = payload.lyrics.slice(0, 8000);
    if (payload.alignmentNotes !== undefined) patch.alignmentNotes = payload.alignmentNotes.slice(0, 4000);
    if (payload.kitName !== undefined) patch.kitName = payload.kitName.slice(0, 60);
    if (payload.studioStateJson !== undefined) patch.studioStateJson = payload.studioStateJson.slice(0, 120000);
    await updateDoc(doc(db, 'projects', projectId), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function duplicateMusicProject(
  ownerId: string,
  source: SavedMusicProject
): Promise<string> {
  return saveMusicProject(ownerId, {
    title: `${source.title} (Copy)`.slice(0, 120),
    category: source.category || 'song',
    genre: source.genre,
    bpm: source.bpm,
    musicalKey: source.musicalKey || 'A minor',
    timeSignature: source.timeSignature || '4/4',
    lyrics: source.lyrics || '',
    alignmentNotes: source.alignmentNotes || '',
    kitName: source.kitName || '',
    studioStateJson: source.studioStateJson,
  });
}

export async function removeMusicProject(projectId: string): Promise<void> {
  const path = `projects/${projectId}`;
  try {
    await deleteDoc(doc(db, 'projects', projectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserProjects(
  ownerId: string,
  onData: (items: SavedMusicProject[]) => void
): Unsubscribe {
  const path = 'projects';
  const q = query(
    collection(db, 'projects'),
    where('ownerId', '==', ownerId),
    orderBy('updatedAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          ...(raw as Omit<SavedMusicProject, 'id' | 'updatedAtMs'>),
          updatedAtMs: raw.updatedAt?.toMillis?.() ?? Date.now(),
        };
      });
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveSocialCampaign(
  ownerId: string,
  payload: {
    platform: 'instagram' | 'facebook' | 'tiktok' | 'whatsapp' | 'youtube';
    headline: string;
    caption: string;
    trackTitle?: string;
  }
): Promise<void> {
  const path = 'social_campaigns';
  try {
    await addDoc(collection(db, 'social_campaigns'), {
      ownerId,
      platform: payload.platform,
      headline: payload.headline.trim().slice(0, 140) || 'Studio Release',
      caption: payload.caption.trim().slice(0, 2200) || 'New drop out now.',
      trackTitle: (payload.trackTitle || '').trim().slice(0, 120),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeUserCampaigns(
  ownerId: string,
  onData: (items: SavedSocialCampaign[]) => void
): Unsubscribe {
  const path = 'social_campaigns';
  const q = query(
    collection(db, 'social_campaigns'),
    where('ownerId', '==', ownerId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SavedSocialCampaign, 'id'>),
      }));
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createSodaSupportPledge(payload: {
  supporterId: string;
  supporterName: string;
  recipientHandle: string;
  recipientRole: 'artist' | 'creator' | 'dj' | 'owner';
  sodaCount: number;
  amountUsd: number;
  message?: string;
}): Promise<void> {
  const path = 'soda_supports';
  try {
    await addDoc(collection(db, 'soda_supports'), {
      supporterId: payload.supporterId,
      supporterName: payload.supporterName.trim().slice(0, 80) || 'Supporter',
      recipientHandle: payload.recipientHandle.trim().slice(0, 80),
      recipientRole: payload.recipientRole,
      sodaCount: Math.max(1, Math.min(100, Math.round(payload.sodaCount))),
      amountUsd: Math.max(1, Math.min(1000, Number(payload.amountUsd))),
      message: (payload.message || '').trim().slice(0, 280),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeMySodaSupports(
  supporterId: string,
  onData: (items: SodaSupportRecord[]) => void
): Unsubscribe {
  const path = 'soda_supports';
  const q = query(
    collection(db, 'soda_supports'),
    where('supporterId', '==', supporterId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SodaSupportRecord, 'id'>),
      }));
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribePublicCreators(onData: (items: CreatorProfile[]) => void): Unsubscribe {
  const path = 'users';
  const q = query(
    collection(db, 'users'),
    where('role', 'in', ['artist', 'creator', 'dj']),
    limit(50)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs
        .map((d) => ({
          uid: d.id,
          displayName: d.data().displayName,
          role: d.data().role,
          buyMeSodaHandle: d.data().buyMeSodaHandle,
          bio: d.data().bio,
          _updatedMs: d.data().updatedAt?.toMillis?.() ?? 0,
        }))
        .sort((a, b) => b._updatedMs - a._updatedMs)
        .map(({ _updatedMs: _ignored, ...profile }) => profile);
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function savePadSampleAssignment(
  ownerId: string,
  payload: Omit<PadSampleAssignment, 'id' | 'ownerId'>
): Promise<void> {
  const safeOwner = ownerId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safePad = payload.padId.replace(/[^a-zA-Z0-9_-]/g, '');
  const docId = `${safeOwner}_${safePad}`.slice(0, 128);
  const path = `pad_assignments/${docId}`;
  const ref = doc(db, 'pad_assignments', docId);

  try {
    const snap = await getDoc(ref);
    const data: Record<string, unknown> = {
      ownerId,
      padId: payload.padId,
      sampleName: payload.sampleName.trim().slice(0, 120) || 'Discover Sample',
      sourceType: payload.sourceType,
      sourceTrackId: payload.sourceTrackId.trim().slice(0, 80) || 'custom',
      grooveStyle: payload.grooveStyle,
      bpm: Math.min(240, Math.max(40, Number(payload.bpm) || 112)),
      sliceStartSec: Math.max(0, Math.min(600, Number(payload.sliceStartSec) || 0)),
      sliceDurationSec: Math.max(0.1, Math.min(8, Number(payload.sliceDurationSec) || 1.5)),
      createdAt: snap.exists() ? snap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (payload.audioBase64 && payload.audioBase64.length <= 300000) {
      data.audioBase64 = payload.audioBase64;
    }
    await setDoc(ref, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removePadSampleAssignment(ownerId: string, padId: string): Promise<void> {
  const safeOwner = ownerId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safePad = padId.replace(/[^a-zA-Z0-9_-]/g, '');
  const docId = `${safeOwner}_${safePad}`.slice(0, 128);
  const path = `pad_assignments/${docId}`;
  try {
    await deleteDoc(doc(db, 'pad_assignments', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserPadAssignments(
  ownerId: string,
  onData: (items: PadSampleAssignment[]) => void
): Unsubscribe {
  const path = 'pad_assignments';
  const q = query(
    collection(db, 'pad_assignments'),
    where('ownerId', '==', ownerId),
    orderBy('updatedAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<PadSampleAssignment, 'id'>),
      }));
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export type CommunityActivityType = 'interaction' | 'shared_track' | 'milestone';

export interface CommunityActivityRecord {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: 'artist' | 'creator' | 'dj' | 'listener';
  activityType: CommunityActivityType;
  title: string;
  detail: string;
  trackTitle?: string;
  bpm?: number;
  grooveStyle?: 'afro' | 'house' | 'trap';
  milestoneTag?: string;
  platform?: string;
  likesCount: number;
  commentsCount: number;
  isPublic: boolean;
  createdAtMs: number;
}

export interface CommunityActivityCommentRecord {
  id: string;
  activityId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAtMs: number;
}

export async function publishCommunityActivity(
  authorId: string,
  payload: {
    authorName: string;
    authorRole?: 'artist' | 'creator' | 'dj' | 'listener';
    activityType: CommunityActivityType;
    title: string;
    detail: string;
    trackTitle?: string;
    bpm?: number;
    grooveStyle?: 'afro' | 'house' | 'trap';
    milestoneTag?: string;
    platform?: string;
  }
): Promise<string> {
  const path = 'community_activities';
  try {
    const docData: Record<string, unknown> = {
      authorId,
      authorName: payload.authorName.trim().slice(0, 80) || 'Studio Creator',
      authorRole: payload.authorRole || 'creator',
      activityType: payload.activityType,
      title: payload.title.trim().slice(0, 140) || 'Studio Update',
      detail: payload.detail.trim().slice(0, 600) || 'Shared in SoundDeck Studio.',
      likesCount: 0,
      commentsCount: 0,
      isPublic: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (payload.trackTitle && payload.trackTitle.trim()) {
      docData.trackTitle = payload.trackTitle.trim().slice(0, 120);
    }
    if (typeof payload.bpm === 'number' && Number.isFinite(payload.bpm)) {
      docData.bpm = Math.min(240, Math.max(40, Math.round(payload.bpm)));
    }
    if (payload.grooveStyle) {
      docData.grooveStyle = payload.grooveStyle;
    }
    if (payload.milestoneTag && payload.milestoneTag.trim()) {
      docData.milestoneTag = payload.milestoneTag.trim().slice(0, 60);
    }
    if (payload.platform && payload.platform.trim()) {
      docData.platform = payload.platform.trim().slice(0, 30);
    }

    const ref = await addDoc(collection(db, 'community_activities'), docData);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeCommunityActivities(
  onData: (items: CommunityActivityRecord[]) => void
): Unsubscribe {
  const path = 'community_activities';
  const q = query(
    collection(db, 'community_activities'),
    where('isPublic', '==', true),
    limit(40)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows: CommunityActivityRecord[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            authorId: String(data.authorId || ''),
            authorName: String(data.authorName || 'Creator'),
            authorRole: (data.authorRole as CommunityActivityRecord['authorRole']) || 'creator',
            activityType: (data.activityType as CommunityActivityType) || 'interaction',
            title: String(data.title || ''),
            detail: String(data.detail || ''),
            trackTitle: typeof data.trackTitle === 'string' ? data.trackTitle : undefined,
            bpm: typeof data.bpm === 'number' ? data.bpm : undefined,
            grooveStyle:
              data.grooveStyle === 'afro' || data.grooveStyle === 'house' || data.grooveStyle === 'trap'
                ? data.grooveStyle
                : undefined,
            milestoneTag: typeof data.milestoneTag === 'string' ? data.milestoneTag : undefined,
            platform: typeof data.platform === 'string' ? data.platform : undefined,
            likesCount: typeof data.likesCount === 'number' ? data.likesCount : 0,
            commentsCount: typeof data.commentsCount === 'number' ? data.commentsCount : 0,
            isPublic: Boolean(data.isPublic),
            createdAtMs: data.createdAt?.toMillis?.() ?? Date.now(),
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function updateCommunityActivityLikes(
  activityId: string,
  nextLikesCount: number
): Promise<void> {
  const path = `community_activities/${activityId}`;
  try {
    await updateDoc(doc(db, 'community_activities', activityId), {
      likesCount: Math.max(0, Math.min(1000000, Math.round(nextLikesCount))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function addCommunityActivityComment(
  activityId: string,
  payload: {
    authorId: string;
    authorName: string;
    text: string;
    currentCommentsCount: number;
  }
): Promise<void> {
  const path = `community_activities/${activityId}/comments`;
  try {
    const batch = writeBatch(db);
    const commentRef = doc(collection(db, 'community_activities', activityId, 'comments'));
    const activityRef = doc(db, 'community_activities', activityId);

    batch.set(commentRef, {
      activityId,
      authorId: payload.authorId,
      authorName: payload.authorName.trim().slice(0, 80) || 'Community Member',
      text: payload.text.trim().slice(0, 400),
      isPublic: true,
      createdAt: serverTimestamp(),
    });

    batch.update(activityRef, {
      commentsCount: Math.max(0, Math.min(100000, payload.currentCommentsCount + 1)),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeCommunityActivityComments(
  activityId: string,
  onData: (items: CommunityActivityCommentRecord[]) => void
): Unsubscribe {
  const path = `community_activities/${activityId}/comments`;
  const q = query(
    collection(db, 'community_activities', activityId, 'comments'),
    where('isPublic', '==', true),
    limit(30)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows: CommunityActivityCommentRecord[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            activityId: String(data.activityId || activityId),
            authorId: String(data.authorId || ''),
            authorName: String(data.authorName || 'Member'),
            text: String(data.text || ''),
            createdAtMs: data.createdAt?.toMillis?.() ?? Date.now(),
          };
        })
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// =========================================================================
// Firebase Storage Audio Upload + Pro Vocal Presets, Collaborations & Export Logs
// =========================================================================

export async function uploadStudioAudioBlob(
  ownerId: string,
  fileName: string,
  blob: Blob
): Promise<{ downloadUrl: string; storagePath: string } | null> {
  try {
    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const path = `studio_audio/${ownerId}/${Date.now()}_${cleanName}`;
    const fileRef = storageRef(storage, path);
    await uploadBytes(fileRef, blob, { contentType: blob.type || 'audio/wav' });
    const downloadUrl = await getDownloadURL(fileRef);
    return { downloadUrl, storagePath: path };
  } catch (err) {
    console.warn('Cloud Storage upload skipped/unavailable:', err);
    return null;
  }
}

export interface SavedVocalPresetRecord {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  presetJson: string;
}

export async function saveVocalPreset(
  ownerId: string,
  payload: { name: string; description?: string; presetJson: string }
): Promise<string> {
  const path = 'vocal_presets';
  try {
    const docRef = await addDoc(collection(db, 'vocal_presets'), {
      ownerId,
      name: payload.name.trim().slice(0, 80) || 'Custom Vocal Chain',
      description: (payload.description || '').trim().slice(0, 240),
      presetJson: payload.presetJson.slice(0, 8000),
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeVocalPreset(presetId: string): Promise<void> {
  const path = `vocal_presets/${presetId}`;
  try {
    await deleteDoc(doc(db, 'vocal_presets', presetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserVocalPresets(
  ownerId: string,
  onData: (items: SavedVocalPresetRecord[]) => void
): Unsubscribe {
  const path = 'vocal_presets';
  const q = query(
    collection(db, 'vocal_presets'),
    where('ownerId', '==', ownerId),
    limit(30)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SavedVocalPresetRecord, 'id'>),
        }))
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export interface StudioCollaborationRecord {
  id: string;
  ownerId: string;
  projectTitle: string;
  bpm: number;
  musicalKey?: string;
  collaboratorEmails: string[];
  stateJson: string;
  updatedAtMs: number;
}

export async function saveOrUpdateCollaborationRoom(
  ownerId: string,
  payload: {
    collabId?: string;
    projectTitle: string;
    bpm: number;
    musicalKey?: string;
    collaboratorEmails: string[];
    stateJson: string;
  }
): Promise<string> {
  const cleanEmails = Array.from(
    new Set(payload.collaboratorEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))
  ).slice(0, 12);

  if (payload.collabId) {
    const path = `studio_collaborations/${payload.collabId}`;
    try {
      await updateDoc(doc(db, 'studio_collaborations', payload.collabId), {
        projectTitle: payload.projectTitle.trim().slice(0, 120) || 'Shared Studio Room',
        bpm: Math.min(240, Math.max(40, Number(payload.bpm) || 112)),
        musicalKey: (payload.musicalKey || 'A minor').slice(0, 32),
        collaboratorEmails: cleanEmails,
        stateJson: payload.stateJson.slice(0, 60000),
        updatedAt: serverTimestamp(),
      });
      return payload.collabId;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    const path = 'studio_collaborations';
    try {
      const ref = await addDoc(collection(db, 'studio_collaborations'), {
        ownerId,
        projectTitle: payload.projectTitle.trim().slice(0, 120) || 'Shared Studio Room',
        bpm: Math.min(240, Math.max(40, Number(payload.bpm) || 112)),
        musicalKey: (payload.musicalKey || 'A minor').slice(0, 32),
        collaboratorEmails: cleanEmails,
        stateJson: payload.stateJson.slice(0, 60000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export function subscribeOwnedCollaborations(
  ownerId: string,
  onData: (items: StudioCollaborationRecord[]) => void
): Unsubscribe {
  const path = 'studio_collaborations';
  const q = query(
    collection(db, 'studio_collaborations'),
    where('ownerId', '==', ownerId),
    limit(20)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId || ''),
            projectTitle: String(data.projectTitle || ''),
            bpm: Number(data.bpm || 112),
            musicalKey: typeof data.musicalKey === 'string' ? data.musicalKey : 'A minor',
            collaboratorEmails: Array.isArray(data.collaboratorEmails) ? data.collaboratorEmails : [],
            stateJson: String(data.stateJson || '{}'),
            updatedAtMs: data.updatedAt?.toMillis?.() ?? Date.now(),
          };
        })
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeInvitedCollaborations(
  email: string,
  onData: (items: StudioCollaborationRecord[]) => void
): Unsubscribe {
  const path = 'studio_collaborations';
  const cleanEmail = email.trim().toLowerCase();
  const q = query(
    collection(db, 'studio_collaborations'),
    where('collaboratorEmails', 'array-contains', cleanEmail),
    limit(20)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId || ''),
            projectTitle: String(data.projectTitle || ''),
            bpm: Number(data.bpm || 112),
            musicalKey: typeof data.musicalKey === 'string' ? data.musicalKey : 'A minor',
            collaboratorEmails: Array.isArray(data.collaboratorEmails) ? data.collaboratorEmails : [],
            stateJson: String(data.stateJson || '{}'),
            updatedAtMs: data.updatedAt?.toMillis?.() ?? Date.now(),
          };
        })
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export interface StudioExportLogRecord {
  id: string;
  ownerId: string;
  projectTitle: string;
  fileName: string;
  format: 'wav' | 'mp3' | 'stems' | 'backup_json';
  sampleRate: number;
  bitDepth?: number;
  sizeBytes: number;
  createdAtMs: number;
}

export async function logStudioExport(
  ownerId: string,
  payload: {
    projectTitle: string;
    fileName: string;
    format: 'wav' | 'mp3' | 'stems' | 'backup_json';
    sampleRate: number;
    bitDepth?: number;
    sizeBytes: number;
  }
): Promise<void> {
  const path = 'export_logs';
  try {
    const docData: Record<string, unknown> = {
      ownerId,
      projectTitle: payload.projectTitle.trim().slice(0, 120) || 'Studio Project',
      fileName: payload.fileName.trim().slice(0, 160) || 'export',
      format: payload.format,
      sampleRate: Math.round(payload.sampleRate),
      sizeBytes: Math.max(0, Math.round(payload.sizeBytes)),
      createdAt: serverTimestamp(),
    };
    if (payload.bitDepth) {
      docData.bitDepth = Math.round(payload.bitDepth);
    }
    await addDoc(collection(db, 'export_logs'), docData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeUserExportLogs(
  ownerId: string,
  onData: (items: StudioExportLogRecord[]) => void
): Unsubscribe {
  const path = 'export_logs';
  const q = query(
    collection(db, 'export_logs'),
    where('ownerId', '==', ownerId),
    limit(25)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerId: String(data.ownerId || ''),
              projectTitle: String(data.projectTitle || ''),
              fileName: String(data.fileName || ''),
              format: (data.format as StudioExportLogRecord['format']) || 'wav',
              sampleRate: Number(data.sampleRate || 44100),
              bitDepth: typeof data.bitDepth === 'number' ? data.bitDepth : undefined,
              sizeBytes: Number(data.sizeBytes || 0),
              createdAtMs: data.createdAt?.toMillis?.() ?? Date.now(),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs)
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// =========================================================================
// Omnichannel Social Hub Collaboration (IG, TikTok, WhatsApp, FB, YouTube) & Admin Monitor
// =========================================================================

export const STUDIO_ADMIN_EMAILS = ['poznanundia@gmail.com', 'nickmundia17@gmail.com'] as const;

export function isStudioAdminUser(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  return (STUDIO_ADMIN_EMAILS as readonly string[]).includes(user.email.trim().toLowerCase());
}

export type OmnichannelPlatform = 'instagram' | 'tiktok' | 'whatsapp' | 'facebook' | 'youtube';
export type OmnichannelEventType = 'post' | 'reel' | 'message' | 'call' | 'comment';
export type OmnichannelEventStatus = 'synced' | 'pending' | 'flagged' | 'resolved';
export type OmnichannelCallState = 'ringing' | 'active' | 'ended' | 'missed';

export interface SocialOmnichannelEventRecord {
  id: string;
  ownerId: string;
  platform: OmnichannelPlatform;
  eventType: OmnichannelEventType;
  direction: 'outbound' | 'inbound';
  authorName: string;
  authorHandle?: string;
  title: string;
  body: string;
  mediaUrl?: string;
  status: OmnichannelEventStatus;
  callState?: OmnichannelCallState;
  replyText?: string;
  isPublic: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export async function createSocialOmnichannelEvent(
  ownerId: string,
  payload: {
    platform: OmnichannelPlatform;
    eventType: OmnichannelEventType;
    direction: 'outbound' | 'inbound';
    authorName: string;
    authorHandle?: string;
    title: string;
    body: string;
    mediaUrl?: string;
    status?: OmnichannelEventStatus;
    callState?: OmnichannelCallState;
    isPublic?: boolean;
  }
): Promise<string> {
  const path = 'social_events';
  try {
    const docData: Record<string, unknown> = {
      ownerId,
      platform: payload.platform,
      eventType: payload.eventType,
      direction: payload.direction,
      authorName: payload.authorName.trim().slice(0, 80) || 'Creator',
      title: payload.title.trim().slice(0, 140) || 'Social Sync Event',
      body: payload.body.trim().slice(0, 2200) || 'Synced via SoundDeck Studio',
      status: payload.status || 'synced',
      isPublic: payload.isPublic ?? false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (payload.authorHandle?.trim()) {
      docData.authorHandle = payload.authorHandle.trim().slice(0, 120);
    }
    if (payload.mediaUrl?.trim()) {
      docData.mediaUrl = payload.mediaUrl.trim().slice(0, 500);
    }
    if (payload.callState) {
      docData.callState = payload.callState;
    }
    const ref = await addDoc(collection(db, 'social_events'), docData);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateSocialOmnichannelEvent(
  eventId: string,
  patch: Partial<{
    status: OmnichannelEventStatus;
    callState: OmnichannelCallState;
    replyText: string;
    body: string;
    isPublic: boolean;
  }>
): Promise<void> {
  const path = `social_events/${eventId}`;
  try {
    const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.callState !== undefined) data.callState = patch.callState;
    if (patch.replyText !== undefined) data.replyText = patch.replyText.trim().slice(0, 1000);
    if (patch.body !== undefined) data.body = patch.body.trim().slice(0, 2200);
    if (patch.isPublic !== undefined) data.isPublic = Boolean(patch.isPublic);
    await updateDoc(doc(db, 'social_events', eventId), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteSocialOmnichannelEvent(eventId: string): Promise<void> {
  const path = `social_events/${eventId}`;
  try {
    await deleteDoc(doc(db, 'social_events', eventId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function mapSocialEventDoc(d: { id: string; data: () => Record<string, unknown> }): SocialOmnichannelEventRecord {
  const data = d.data();
  const rawCreated = data.createdAt as { toMillis?: () => number } | undefined;
  const rawUpdated = data.updatedAt as { toMillis?: () => number } | undefined;
  return {
    id: d.id,
    ownerId: String(data.ownerId || ''),
    platform: (data.platform as OmnichannelPlatform) || 'instagram',
    eventType: (data.eventType as OmnichannelEventType) || 'post',
    direction: data.direction === 'inbound' ? 'inbound' : 'outbound',
    authorName: String(data.authorName || 'Creator'),
    authorHandle: typeof data.authorHandle === 'string' ? data.authorHandle : undefined,
    title: String(data.title || 'Social Event'),
    body: String(data.body || ''),
    mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined,
    status: (data.status as OmnichannelEventStatus) || 'synced',
    callState: typeof data.callState === 'string' ? (data.callState as OmnichannelCallState) : undefined,
    replyText: typeof data.replyText === 'string' ? data.replyText : undefined,
    isPublic: Boolean(data.isPublic),
    createdAtMs: rawCreated?.toMillis?.() ?? Date.now(),
    updatedAtMs: rawUpdated?.toMillis?.() ?? Date.now(),
  };
}

export function subscribeUserSocialEvents(
  ownerId: string,
  onData: (items: SocialOmnichannelEventRecord[]) => void
): Unsubscribe {
  const path = 'social_events';
  const q = query(
    collection(db, 'social_events'),
    where('ownerId', '==', ownerId),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map(mapSocialEventDoc).sort((a, b) => b.updatedAtMs - a.updatedAtMs));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAdminSocialEvents(
  onData: (items: SocialOmnichannelEventRecord[]) => void
): Unsubscribe {
  const path = 'social_events';
  const q = query(
    collection(db, 'social_events'),
    orderBy('updatedAt', 'desc'),
    limit(80)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map(mapSocialEventDoc));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}



