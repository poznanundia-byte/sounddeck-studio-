import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  Phone,
  PhoneIncoming,
  PhoneOff,
  MessageSquare,
  Film,
  Send,
  RefreshCw,
  CheckCircle2,
  Flag,
  Trash2,
  Plus,
  Instagram,
  Music2,
  MessageCircle,
  Share2,
  Youtube,
  ArrowDownLeft,
  ArrowUpRight,
  Radio,
} from 'lucide-react';
import { type User } from 'firebase/auth';
import {
  isStudioAdminUser,
  subscribeAdminSocialEvents,
  subscribeUserSocialEvents,
  createSocialOmnichannelEvent,
  updateSocialOmnichannelEvent,
  deleteSocialOmnichannelEvent,
  type OmnichannelPlatform,
  type OmnichannelEventType,
  type OmnichannelEventStatus,
  type OmnichannelCallState,
  type SocialOmnichannelEventRecord,
} from '../../firebase';
import { getAudioContext } from '../../audio/studioAudio';
import { safeApiFetch } from '../../services/apiClient';

interface ServerSocialInboxItem {
  id: string;
  platform: OmnichannelPlatform;
  eventType: OmnichannelEventType;
  direction: 'outbound' | 'inbound';
  authorName: string;
  authorHandle: string;
  title: string;
  body: string;
  mediaUrl?: string;
  status: OmnichannelEventStatus;
  callState?: OmnichannelCallState;
  replyText?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

interface UnifiedOmnichannelItem {
  id: string;
  source: 'server' | 'firestore';
  ownerId?: string;
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
  timestampMs: number;
}

interface OmnichannelAdminDeskProps {
  user: User | null;
  whatsappPhone: string;
  handles: {
    instagram: string;
    tiktok: string;
    whatsapp: string;
    facebook: string;
    youtube: string;
  };
  onNotify?: (msg: string) => void;
}

const PLATFORM_META: Record<
  OmnichannelPlatform,
  { label: string; colorClass: string; Icon: typeof Instagram }
> = {
  instagram: { label: 'Instagram', colorClass: 'text-pink-400', Icon: Instagram },
  tiktok: { label: 'TikTok', colorClass: 'text-cyan-400', Icon: Music2 },
  whatsapp: { label: 'WhatsApp', colorClass: 'text-emerald-400', Icon: MessageCircle },
  facebook: { label: 'Facebook', colorClass: 'text-sky-400', Icon: Share2 },
  youtube: { label: 'YouTube', colorClass: 'text-rose-400', Icon: Youtube },
};

export function OmnichannelAdminDesk({
  user,
  whatsappPhone,
  handles,
  onNotify,
}: OmnichannelAdminDeskProps) {
  const isAdmin = isStudioAdminUser(user);
  const [serverEvents, setServerEvents] = useState<ServerSocialInboxItem[]>([]);
  const [firestoreEvents, setFirestoreEvents] = useState<SocialOmnichannelEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<'all' | OmnichannelPlatform>('all');
  const [typeFilter, setTypeFilter] = useState<
    'all' | 'call' | 'message' | 'post_reel' | 'comment'
  >('all');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeCallSecById, setActiveCallSecById] = useState<Record<string, number>>({});

  // Inbound webhook / two-way sync test drawer state
  const [simOpen, setSimOpen] = useState(false);
  const [simPlatform, setSimPlatform] = useState<OmnichannelPlatform>('whatsapp');
  const [simType, setSimType] = useState<OmnichannelEventType>('call');
  const [simAuthor, setSimAuthor] = useState('Elena · A&R Desk');
  const [simBody, setSimBody] = useState(
    'Calling from WhatsApp Studio line to review the master stem & approve today’s Reel.'
  );
  const [simSubmitting, setSimSubmitting] = useState(false);

  const ringOscRef = useRef<OscillatorNode | null>(null);

  const fetchServerInbox = useCallback(async () => {
    try {
      const res = await safeApiFetch<{ events?: ServerSocialInboxItem[] }>(
        '/api/social/inbound-events'
      );
      if (res.ok && Array.isArray(res.data?.events)) {
        setServerEvents(res.data.events);
      } else if (res.isStaticFallback && serverEvents.length === 0) {
        setServerEvents([
          {
            id: 'static_wa_call',
            platform: 'whatsapp',
            eventType: 'call',
            direction: 'inbound',
            authorName: 'DJ Kofi (Accra)',
            authorHandle: '+233 24 ••• 8190',
            title: 'Incoming WhatsApp Audio Call · Remix Feature',
            body: 'Calling about clearing the Afro-house stem bounce for tonight’s club set.',
            status: 'pending',
            callState: 'ringing',
            createdAtIso: new Date(Date.now() - 120000).toISOString(),
            updatedAtIso: new Date(Date.now() - 120000).toISOString(),
          },
          {
            id: 'static_ig_dm',
            platform: 'instagram',
            eventType: 'message',
            direction: 'inbound',
            authorName: 'Nadia Beats',
            authorHandle: '@nadiabeats.official',
            title: 'Instagram DM · Collab Reel',
            body: 'Yo! Just stitched your Midnight Studio Loop on Reels — can you approve the collab tag?',
            status: 'pending',
            createdAtIso: new Date(Date.now() - 360000).toISOString(),
            updatedAtIso: new Date(Date.now() - 360000).toISOString(),
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }, [serverEvents.length]);

  useEffect(() => {
    fetchServerInbox();
    const timer = window.setInterval(fetchServerInbox, 12000);
    return () => window.clearInterval(timer);
  }, [fetchServerInbox]);

  // Firestore real-time subscription (Admin sees all users' events; creator sees their own)
  useEffect(() => {
    if (!user) {
      setFirestoreEvents([]);
      return;
    }
    const unsub = isAdmin
      ? subscribeAdminSocialEvents(setFirestoreEvents)
      : subscribeUserSocialEvents(user.uid, setFirestoreEvents);
    return () => unsub();
  }, [user, isAdmin]);

  // Subtle Web Audio connect chime helper when answering a call
  const playCallChime = (frequency = 587.33) => {
    try {
      const ctx = getAudioContext();
      if (ringOscRef.current) {
        try {
          ringOscRef.current.stop();
        } catch {
          // ignore
        }
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.25, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
      ringOscRef.current = osc;
    } catch {
      // ignore if audio context blocked
    }
  };

  // Merge server + Firestore into unified sorted timeline
  const unifiedItems: UnifiedOmnichannelItem[] = useMemo(() => {
    const fromFs: UnifiedOmnichannelItem[] = firestoreEvents.map((e) => ({
      id: e.id,
      source: 'firestore',
      ownerId: e.ownerId,
      platform: e.platform,
      eventType: e.eventType,
      direction: e.direction,
      authorName: e.authorName,
      authorHandle: e.authorHandle,
      title: e.title,
      body: e.body,
      mediaUrl: e.mediaUrl,
      status: e.status,
      callState: e.callState,
      replyText: e.replyText,
      timestampMs: e.updatedAtMs,
    }));

    const fromServer: UnifiedOmnichannelItem[] = serverEvents.map((e) => ({
      id: e.id,
      source: 'server',
      platform: e.platform,
      eventType: e.eventType,
      direction: e.direction,
      authorName: e.authorName,
      authorHandle: e.authorHandle,
      title: e.title,
      body: e.body,
      mediaUrl: e.mediaUrl,
      status: e.status,
      callState: e.callState,
      replyText: e.replyText,
      timestampMs: Date.parse(e.updatedAtIso || e.createdAtIso) || Date.now(),
    }));

    return [...fromFs, ...fromServer].sort((a, b) => b.timestampMs - a.timestampMs);
  }, [firestoreEvents, serverEvents]);

  // Live timer for any active call
  const activeCallIds = useMemo(
    () =>
      unifiedItems
        .filter((i) => i.eventType === 'call' && i.callState === 'active')
        .map((i) => i.id),
    [unifiedItems]
  );

  useEffect(() => {
    if (activeCallIds.length === 0) return;
    const timer = window.setInterval(() => {
      setActiveCallSecById((prev) => {
        const next = { ...prev };
        for (const id of activeCallIds) {
          next[id] = (next[id] || 0) + 1;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeCallIds]);

  const activeOrRingingCalls = unifiedItems.filter(
    (i) => i.eventType === 'call' && (i.callState === 'ringing' || i.callState === 'active')
  );

  const visibleItems = unifiedItems.filter((item) => {
    if (platformFilter !== 'all' && item.platform !== platformFilter) return false;
    if (typeFilter === 'call' && item.eventType !== 'call') return false;
    if (typeFilter === 'message' && item.eventType !== 'message') return false;
    if (typeFilter === 'comment' && item.eventType !== 'comment') return false;
    if (
      typeFilter === 'post_reel' &&
      item.eventType !== 'post' &&
      item.eventType !== 'reel'
    ) {
      return false;
    }
    return true;
  });

  const handleCallTransition = async (
    item: UnifiedOmnichannelItem,
    nextCallState: OmnichannelCallState
  ) => {
    setBusyId(item.id);
    if (nextCallState === 'active') {
      playCallChime(587.33);
    } else if (nextCallState === 'ended' || nextCallState === 'missed') {
      playCallChime(392.0);
    }
    const nextStatus: OmnichannelEventStatus =
      nextCallState === 'active' ? 'synced' : 'resolved';

    try {
      if (item.source === 'server') {
        const res = await safeApiFetch<{ item?: ServerSocialInboxItem }>(
          `/api/social/inbound-events/${encodeURIComponent(item.id)}/moderate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callState: nextCallState, status: nextStatus }),
          }
        );
        if (res.ok && res.data?.item) {
          setServerEvents((prev) =>
            prev.map((e) => (e.id === item.id ? res.data!.item! : e))
          );
        } else {
          setServerEvents((prev) =>
            prev.map((e) =>
              e.id === item.id ? { ...e, callState: nextCallState, status: nextStatus } : e
            )
          );
        }
      } else {
        await updateSocialOmnichannelEvent(item.id, {
          callState: nextCallState,
          status: nextStatus,
        });
      }
      onNotify?.(
        nextCallState === 'active'
          ? `Connected ${item.platform.toUpperCase()} call with ${item.authorName}.`
          : `Marked call with ${item.authorName} as ${nextCallState}.`
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleModerateStatus = async (
    item: UnifiedOmnichannelItem,
    status: OmnichannelEventStatus
  ) => {
    setBusyId(item.id);
    try {
      if (item.source === 'server') {
        const res = await safeApiFetch<{ item?: ServerSocialInboxItem }>(
          `/api/social/inbound-events/${encodeURIComponent(item.id)}/moderate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          }
        );
        if (res.ok && res.data?.item) {
          setServerEvents((prev) =>
            prev.map((e) => (e.id === item.id ? res.data!.item! : e))
          );
        } else {
          setServerEvents((prev) =>
            prev.map((e) => (e.id === item.id ? { ...e, status } : e))
          );
        }
      } else {
        await updateSocialOmnichannelEvent(item.id, { status });
      }
      onNotify?.(`Updated "${item.title}" to ${status}.`);
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveItem = async (item: UnifiedOmnichannelItem) => {
    setBusyId(item.id);
    try {
      if (item.source === 'server') {
        await safeApiFetch(
          `/api/social/inbound-events/${encodeURIComponent(item.id)}/moderate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ remove: true }),
          }
        );
        setServerEvents((prev) => prev.filter((e) => e.id !== item.id));
      } else {
        await deleteSocialOmnichannelEvent(item.id);
      }
      onNotify?.(`Removed ${item.platform} ${item.eventType} entry.`);
    } finally {
      setBusyId(null);
    }
  };

  const handleSendTwoWayReply = async (e: React.FormEvent, item: UnifiedOmnichannelItem) => {
    e.preventDefault();
    const text = (replyDrafts[item.id] || '').trim();
    if (!text) return;
    setBusyId(item.id);
    try {
      // 1. Push outbound bridge delivery
      await safeApiFetch('/api/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms: [item.platform],
          eventType: item.eventType === 'message' || item.eventType === 'call' ? 'message' : 'comment',
          title: `Reply to ${item.authorName}`,
          body: text,
          authorName: user?.displayName || 'SoundDeck Admin',
          authorHandle: handles[item.platform] || '@sounddeck.studio',
          whatsappPhone,
        }),
      });

      // 2. Mark source event resolved with reply
      if (item.source === 'server') {
        const res = await safeApiFetch<{ item?: ServerSocialInboxItem }>(
          `/api/social/inbound-events/${encodeURIComponent(item.id)}/moderate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ replyText: text, status: 'resolved' }),
          }
        );
        if (res.ok && res.data?.item) {
          setServerEvents((prev) =>
            prev.map((ev) => (ev.id === item.id ? res.data!.item! : ev))
          );
        } else {
          setServerEvents((prev) =>
            prev.map((ev) =>
              ev.id === item.id ? { ...ev, replyText: text, status: 'resolved' } : ev
            )
          );
        }
      } else {
        await updateSocialOmnichannelEvent(item.id, {
          replyText: text,
          status: 'resolved',
        });
      }

      if (user) {
        await createSocialOmnichannelEvent(user.uid, {
          platform: item.platform,
          eventType: item.eventType === 'message' || item.eventType === 'call' ? 'message' : 'comment',
          direction: 'outbound',
          authorName: user.displayName || 'Studio Admin',
          authorHandle: handles[item.platform] || user.email || '@sounddeck.studio',
          title: `Re: ${item.title}`,
          body: text,
          status: 'synced',
          isPublic: item.eventType !== 'message' && item.eventType !== 'call',
        });
      }

      setReplyDrafts((prev) => ({ ...prev, [item.id]: '' }));
      onNotify?.(`Reply sent & two-way synced to ${item.platform.toUpperCase()}!`);
      fetchServerInbox();
    } finally {
      setBusyId(null);
    }
  };

  const handleSimulateWebhookEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simBody.trim()) return;
    setSimSubmitting(true);
    try {
      const payload = {
        eventType: simType,
        authorName: simAuthor.trim() || `${simPlatform.toUpperCase()} Contact`,
        authorHandle:
          simPlatform === 'whatsapp'
            ? whatsappPhone || '+1 555 ••• 0192'
            : `@${simAuthor.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'fan'}`,
        title: `Inbound ${simPlatform.toUpperCase()} ${simType.toUpperCase()}`,
        body: simBody.trim(),
        callState: simType === 'call' ? 'ringing' : undefined,
      };
      const res = await safeApiFetch<{ item?: ServerSocialInboxItem }>(
        `/api/social/webhook/${simPlatform}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (res.ok && res.data?.item) {
        setServerEvents((prev) => [res.data!.item!, ...prev]);
      }

      if (user) {
        await createSocialOmnichannelEvent(user.uid, {
          platform: simPlatform,
          eventType: simType,
          direction: 'inbound',
          authorName: payload.authorName,
          authorHandle: payload.authorHandle,
          title: payload.title,
          body: payload.body,
          status: simType === 'call' ? 'pending' : 'synced',
          callState: simType === 'call' ? 'ringing' : undefined,
          isPublic: simType !== 'call' && simType !== 'message',
        });
      }

      if (simType === 'call') {
        playCallChime(659.25);
      }
      setSimOpen(false);
      onNotify?.(`Inbound ${simPlatform.toUpperCase()} ${simType} synced into SoundDeck!`);
    } finally {
      setSimSubmitting(false);
    }
  };

  const counts = {
    total: unifiedItems.length,
    calls: unifiedItems.filter((i) => i.eventType === 'call').length,
    pending: unifiedItems.filter((i) => i.status === 'pending').length,
    flagged: unifiedItems.filter((i) => i.status === 'flagged').length,
  };

  return (
    <section
      aria-labelledby="omnichannel-admin-desk-heading"
      className="rounded-xl bg-[#13161B] border border-[#232833] p-5 space-y-5"
    >
      {/* Header & Admin Control Status */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#232833] pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="omnichannel-admin-desk-heading"
              className="font-display text-lg font-semibold text-slate-100 flex items-center gap-2"
            >
              <Radio className="w-4 h-4 text-amber-400" />
              <span>Two-Way Omnichannel Inbox &amp; Call Console</span>
            </h3>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-mono font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin Monitor Active ({user?.email})</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Posts, reels, messages, comments, and incoming calls synced bidirectionally across Instagram, TikTok, WhatsApp, Facebook &amp; YouTube.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSimOpen((v) => !v)}
            className="px-3 py-2 rounded-lg bg-[#0B0D10] hover:bg-[#1B2028] text-amber-300 text-xs font-semibold border border-amber-500/40 flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Sync / Simulate Inbound Event</span>
          </button>
          <button
            type="button"
            onClick={fetchServerInbox}
            className="px-3 py-2 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-slate-200 text-xs font-medium border border-[#2A313E] flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync Now</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-[#0B0D10] border border-[#232833]">
          <div className="text-[11px] text-slate-400">Synced Events</div>
          <div className="font-display text-xl font-bold text-slate-100 tabular-nums mt-0.5">
            {counts.total}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-[#0B0D10] border border-[#232833]">
          <div className="text-[11px] text-slate-400">Social Voice / Calls</div>
          <div className="font-display text-xl font-bold text-emerald-400 tabular-nums mt-0.5">
            {counts.calls}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-[#0B0D10] border border-[#232833]">
          <div className="text-[11px] text-slate-400">Needs Attention</div>
          <div className="font-display text-xl font-bold text-amber-400 tabular-nums mt-0.5">
            {counts.pending}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-[#0B0D10] border border-[#232833]">
          <div className="text-[11px] text-slate-400">Flagged / Review</div>
          <div className="font-display text-xl font-bold text-rose-400 tabular-nums mt-0.5">
            {counts.flagged}
          </div>
        </div>
      </div>

      {/* Live Ringing / Active Call Bar */}
      {activeOrRingingCalls.length > 0 && (
        <div className="space-y-2">
          {activeOrRingingCalls.map((callItem) => {
            const meta = PLATFORM_META[callItem.platform];
            const isRinging = callItem.callState === 'ringing';
            const secs = activeCallSecById[callItem.id] || 0;
            const durLabel = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(
              secs % 60
            ).padStart(2, '0')}`;
            return (
              <div
                key={`callbar_${callItem.id}`}
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isRinging
                    ? 'bg-emerald-950/35 border-emerald-500/60'
                    : 'bg-[#0B141A] border-amber-500/50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      isRinging
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    <PhoneIncoming className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                      <span className={`uppercase font-mono ${meta.colorClass}`}>{meta.label}</span>
                      <span>·</span>
                      <span className="truncate">{callItem.authorName}</span>
                      <span className="font-mono text-[11px] text-emerald-300">
                        {isRinging ? 'Incoming Call' : `Active · ${durLabel}`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 truncate">{callItem.body}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isRinging ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === callItem.id}
                        onClick={() => handleCallTransition(callItem, 'active')}
                        className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Answer Call</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyId === callItem.id}
                        onClick={() => handleCallTransition(callItem, 'missed')}
                        className="px-3 py-2 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-200 text-xs font-semibold border border-rose-700/60 flex items-center gap-1.5"
                      >
                        <PhoneOff className="w-3.5 h-3.5" />
                        <span>Decline</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === callItem.id}
                      onClick={() => handleCallTransition(callItem, 'ended')}
                      className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <PhoneOff className="w-3.5 h-3.5" />
                      <span>End Call ({durLabel})</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inbound Webhook / Two-Way Test Form */}
      {simOpen && (
        <form
          onSubmit={handleSimulateWebhookEvent}
          className="p-4 rounded-xl bg-[#0B0D10] border border-amber-500/40 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300">
              Trigger / Test Inbound Webhook Event from Social App
            </span>
            <button
              type="button"
              onClick={() => setSimOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <select
              value={simPlatform}
              onChange={(e) => setSimPlatform(e.target.value as OmnichannelPlatform)}
              className="px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-100"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="facebook">Facebook</option>
              <option value="youtube">YouTube</option>
            </select>
            <select
              value={simType}
              onChange={(e) => setSimType(e.target.value as OmnichannelEventType)}
              className="px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-100"
            >
              <option value="call">Incoming Call</option>
              <option value="message">Direct Message</option>
              <option value="reel">New Reel / Short</option>
              <option value="post">New Post</option>
              <option value="comment">New Comment</option>
            </select>
            <input
              type="text"
              value={simAuthor}
              onChange={(e) => setSimAuthor(e.target.value)}
              placeholder="Sender / Contact Name"
              className="px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-100"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={simBody}
              onChange={(e) => setSimBody(e.target.value)}
              placeholder="Message, reel caption, comment, or call topic..."
              className="flex-1 px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-100"
            />
            <button
              type="submit"
              disabled={simSubmitting}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shrink-0"
            >
              {simSubmitting ? 'Pushing...' : 'Push Inbound Event'}
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#0B0D10] border border-[#232833]">
          {(
            [
              { id: 'all', label: 'All Platforms' },
              { id: 'instagram', label: 'Instagram' },
              { id: 'tiktok', label: 'TikTok' },
              { id: 'whatsapp', label: 'WhatsApp' },
              { id: 'facebook', label: 'Facebook' },
              { id: 'youtube', label: 'YouTube' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPlatformFilter(tab.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                platformFilter === tab.id
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#0B0D10] border border-[#232833]">
          {(
            [
              { id: 'all', label: 'All Types' },
              { id: 'call', label: 'Calls' },
              { id: 'message', label: 'Messages' },
              { id: 'post_reel', label: 'Posts & Reels' },
              { id: 'comment', label: 'Comments' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeFilter(t.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                typeFilter === t.id
                  ? 'bg-[#1B2028] text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Unified Omnichannel Stream */}
      {visibleItems.length === 0 ? (
        <div className="p-8 rounded-xl bg-[#0B0D10] border border-[#232833] text-center text-xs text-slate-400">
          No synced events match the active filters. Publish a post above or push an inbound event to see two-way sync in action.
        </div>
      ) : (
        <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
          {visibleItems.map((item) => {
            const meta = PLATFORM_META[item.platform] || PLATFORM_META.instagram;
            const PlatIcon = meta.Icon;
            const timeLabel = new Date(item.timestampMs).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={`${item.source}_${item.id}`}
                className={`p-4 rounded-xl bg-[#0B0D10] border space-y-2.5 ${
                  item.status === 'flagged'
                    ? 'border-rose-500/60'
                    : item.status === 'pending'
                    ? 'border-amber-500/40'
                    : 'border-[#232833]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#13161B] border border-[#232833] flex items-center justify-center shrink-0">
                      <PlatIcon className={`w-4 h-4 ${meta.colorClass}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                        <span className={`font-semibold uppercase ${meta.colorClass}`}>
                          {meta.label}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="inline-flex items-center gap-1 text-slate-300 uppercase">
                          {item.direction === 'inbound' ? (
                            <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3 text-amber-400" />
                          )}
                          {item.direction} {item.eventType}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">{timeLabel}</span>
                      </div>
                      <div className="text-xs font-semibold text-slate-100 truncate">
                        {item.authorName}{' '}
                        {item.authorHandle && (
                          <span className="font-mono font-normal text-slate-400">
                            ({item.authorHandle})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status + Admin Controls */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
                        item.status === 'resolved' || item.status === 'synced'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : item.status === 'flagged'
                          ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {item.callState ? `${item.callState} · ${item.status}` : item.status}
                    </span>

                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleModerateStatus(item, 'resolved')}
                          disabled={busyId === item.id}
                          title="Approve / Resolve"
                          className="p-1.5 rounded bg-[#13161B] hover:bg-emerald-500/20 text-emerald-400 border border-[#232833]"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleModerateStatus(item, 'flagged')}
                          disabled={busyId === item.id}
                          title="Flag for Review"
                          className="p-1.5 rounded bg-[#13161B] hover:bg-amber-500/20 text-amber-400 border border-[#232833]"
                        >
                          <Flag className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item)}
                      disabled={busyId === item.id}
                      title="Delete / Dismiss"
                      className="p-1.5 rounded bg-[#13161B] hover:bg-rose-500/20 text-rose-400 border border-[#232833]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-medium text-amber-200 flex items-center gap-1.5">
                    {item.eventType === 'reel' ? (
                      <Film className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : item.eventType === 'call' ? (
                      <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span>{item.title}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{item.body}</p>
                </div>

                {item.replyText && (
                  <div className="px-3 py-2 rounded-lg bg-[#13161B] border border-emerald-800/40 text-xs text-emerald-200">
                    <span className="font-mono text-[10px] uppercase text-emerald-400 mr-2">
                      Synced Reply:
                    </span>
                    <span>{item.replyText}</span>
                  </div>
                )}

                {/* Two-Way Reply Bar */}
                <form
                  onSubmit={(e) => handleSendTwoWayReply(e, item)}
                  className="flex items-center gap-2 pt-1"
                >
                  <input
                    type="text"
                    value={replyDrafts[item.id] || ''}
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    placeholder={`Reply back to ${item.platform.toUpperCase()} (${item.authorName})...`}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={busyId === item.id || !(replyDrafts[item.id] || '').trim()}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Send className="w-3 h-3" />
                    <span>Send &amp; Sync</span>
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
