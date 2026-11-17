import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  CupSoda,
  Heart,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import { type User } from 'firebase/auth';
import {
  addCommunityActivityComment,
  publishCommunityActivity,
  subscribeCommunityActivities,
  subscribeCommunityActivityComments,
  updateCommunityActivityLikes,
  type CommunityActivityCommentRecord,
  type CommunityActivityRecord,
  type CommunityActivityType,
  type CreatorProfile,
  type SavedMusicProject,
} from '../../firebase';

export type ActivityGrooveStyle = 'afro' | 'house' | 'trap';

export interface LocalActivityItem {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: 'artist' | 'creator' | 'dj' | 'listener';
  activityType: CommunityActivityType;
  title: string;
  detail: string;
  trackTitle?: string;
  bpm?: number;
  grooveStyle?: ActivityGrooveStyle;
  milestoneTag?: string;
  platform?: string;
  likesCount: number;
  commentsCount: number;
  createdAtMs: number;
  isFirestoreDoc: boolean;
}

interface CommunityActivityFeedProps {
  user: User | null;
  profile: CreatorProfile | null;
  projects: SavedMusicProject[];
  creators: CreatorProfile[];
  activeTrackTitle: string;
  studioBpm: number;
  playingItemId: string | null;
  onToggleAudio: (itemId: string, style: ActivityGrooveStyle) => void;
  onLoadTrackIntoStudio: (payload: {
    trackTitle: string;
    headline: string;
    caption: string;
  }) => void;
  onSupportCreator?: (recipient?: string) => void;
  onOpenAuth: () => void;
  externalPostedTrigger?: {
    nonce: number;
    activityType: CommunityActivityType;
    title: string;
    detail: string;
    trackTitle?: string;
    bpm?: number;
    grooveStyle?: ActivityGrooveStyle;
    milestoneTag?: string;
    platform?: string;
  } | null;
}

const MILESTONE_PRESETS = [
  'Mastered Mixdown',
  '100 Community Plays',
  'Beat Pack Completed',
  'Live DJ Set Locked',
  'Open Collab Ready',
];

const SEEDED_COMMUNITY_FEED: LocalActivityItem[] = [
  {
    id: 'seed_track_1',
    authorId: 'seed_khalid',
    authorName: 'DJ Khalid Live',
    authorRole: 'dj',
    activityType: 'shared_track',
    title: 'Shared a new Afro-House club pocket',
    detail:
      'Dropped a 118 BPM log drum + Rhodes chord bounce straight out of SoundDeck. Grab it into your studio deck or stitch a vocal verse.',
    trackTitle: 'Nairobi Skyline (VIP Pocket)',
    bpm: 118,
    grooveStyle: 'afro',
    platform: 'SoundCloud',
    likesCount: 42,
    commentsCount: 2,
    createdAtMs: Date.now() - 1000 * 60 * 14,
    isFirestoreDoc: false,
  },
  {
    id: 'seed_milestone_1',
    authorId: 'seed_nora',
    authorName: 'Nora Vocals',
    authorRole: 'artist',
    activityType: 'milestone',
    title: 'Unlocked Studio Milestone: Mastered 4-Track EP',
    detail:
      'Wrapped final vocal bus compression and sub harmonics in the 3D Mastering Stage. Celebrating with the community tonight!',
    trackTitle: 'Golden Hour Hooks',
    bpm: 108,
    grooveStyle: 'house',
    milestoneTag: 'Mastered Mixdown',
    likesCount: 67,
    commentsCount: 1,
    createdAtMs: Date.now() - 1000 * 60 * 38,
    isFirestoreDoc: false,
  },
  {
    id: 'seed_interaction_1',
    authorId: 'seed_jay',
    authorName: 'Studio Jay',
    authorRole: 'creator',
    activityType: 'interaction',
    title: 'Looking for a flute or guitar counter-melody',
    detail:
      'Just posted a crisp 132 BPM Trap 808 loop in Discover. Drop a reply below if you want stems for an open-verse remix challenge!',
    trackTitle: 'Midnight Telemetry 808',
    bpm: 132,
    grooveStyle: 'trap',
    likesCount: 29,
    commentsCount: 1,
    createdAtMs: Date.now() - 1000 * 60 * 65,
    isFirestoreDoc: false,
  },
];

const SEEDED_COMMENTS: Record<
  string,
  { id: string; authorName: string; text: string; createdAtMs: number }[]
> = {
  seed_track_1: [
    {
      id: 'sc1',
      authorName: 'Nora Vocals',
      text: 'The swing on the shaker pocket is unreal. Loading this into Music Creation!',
      createdAtMs: Date.now() - 1000 * 60 * 10,
    },
    {
      id: 'sc2',
      authorName: 'Maya VIP',
      text: 'Ready for the full Friday release!',
      createdAtMs: Date.now() - 1000 * 60 * 6,
    },
  ],
  seed_milestone_1: [
    {
      id: 'sc3',
      authorName: 'DJ Khalid Live',
      text: 'Huge congrats on finishing the EP master!',
      createdAtMs: Date.now() - 1000 * 60 * 22,
    },
  ],
  seed_interaction_1: [
    {
      id: 'sc4',
      authorName: 'Toby Synth',
      text: 'Count me in — sending a Rhodes + guitar stem tonight.',
      createdAtMs: Date.now() - 1000 * 60 * 44,
    },
  ],
};

function formatRelativeTime(tsMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - tsMs) / 1000));
  if (diffSec < 45) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function CommunityActivityFeed({
  user,
  profile,
  projects,
  creators,
  activeTrackTitle,
  studioBpm,
  playingItemId,
  onToggleAudio,
  onLoadTrackIntoStudio,
  onSupportCreator,
  onOpenAuth,
  externalPostedTrigger,
}: CommunityActivityFeedProps) {
  const [filter, setFilter] = useState<'all' | CommunityActivityType>('all');
  const [remoteActivities, setRemoteActivities] = useState<CommunityActivityRecord[]>([]);
  const [localActivities, setLocalActivities] = useState<LocalActivityItem[]>(() => {
    try {
      const saved = localStorage.getItem('sounddeck_community_activity_feed');
      return saved ? (JSON.parse(saved) as LocalActivityItem[]) : [];
    } catch {
      return [];
    }
  });
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sounddeck_community_liked_ids');
      return saved ? (JSON.parse(saved) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [localCommentsById, setLocalCommentsById] = useState<
    Record<string, { id: string; authorName: string; text: string; createdAtMs: number }[]>
  >(() => {
    try {
      const saved = localStorage.getItem('sounddeck_community_local_comments');
      return saved ? (JSON.parse(saved) as Record<string, { id: string; authorName: string; text: string; createdAtMs: number }[]>) : SEEDED_COMMENTS;
    } catch {
      return SEEDED_COMMENTS;
    }
  });
  const [remoteCommentsById, setRemoteCommentsById] = useState<
    Record<string, CommunityActivityCommentRecord[]>
  >({});

  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  // Quick composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [postType, setPostType] = useState<CommunityActivityType>('shared_track');
  const [postTitle, setPostTitle] = useState('');
  const [postDetail, setPostDetail] = useState('');
  const [postTrackTitle, setPostTrackTitle] = useState(activeTrackTitle || 'Midnight Studio Loop');
  const [postStyle, setPostStyle] = useState<ActivityGrooveStyle>('afro');
  const [postMilestoneTag, setPostMilestoneTag] = useState(MILESTONE_PRESETS[0]);
  const [posting, setPosting] = useState(false);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);

  useEffect(() => {
    if (activeTrackTitle) {
      setPostTrackTitle(activeTrackTitle);
    }
  }, [activeTrackTitle]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'sounddeck_community_activity_feed',
        JSON.stringify(localActivities.slice(0, 30))
      );
    } catch {
      // ignore storage errors
    }
  }, [localActivities]);

  useEffect(() => {
    try {
      localStorage.setItem('sounddeck_community_liked_ids', JSON.stringify(likedIds));
    } catch {
      // ignore
    }
  }, [likedIds]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'sounddeck_community_local_comments',
        JSON.stringify(localCommentsById)
      );
    } catch {
      // ignore
    }
  }, [localCommentsById]);

  // Real-time Firestore subscription when signed in
  useEffect(() => {
    if (!user) {
      setRemoteActivities([]);
      return;
    }
    const unsub = subscribeCommunityActivities((items) => {
      setRemoteActivities(items);
    });
    return () => unsub();
  }, [user]);

  // Subscribe to comments when a Firestore activity card is expanded
  useEffect(() => {
    if (!user || !expandedCommentId) return;
    const isRemote = remoteActivities.some((item) => item.id === expandedCommentId);
    if (!isRemote) return;

    const unsub = subscribeCommunityActivityComments(expandedCommentId, (comments) => {
      setRemoteCommentsById((prev) => ({
        ...prev,
        [expandedCommentId]: comments,
      }));
    });
    return () => unsub();
  }, [user, expandedCommentId, remoteActivities]);

  // Auto-record activity triggers emitted from SocialHubTab actions (e.g. publishing a drop)
  useEffect(() => {
    if (!externalPostedTrigger) return;
    const authorName =
      profile?.displayName || user?.displayName || 'Studio Creator';
    const authorRole = profile?.role || 'creator';

    if (user) {
      publishCommunityActivity(user.uid, {
        authorName,
        authorRole,
        activityType: externalPostedTrigger.activityType,
        title: externalPostedTrigger.title,
        detail: externalPostedTrigger.detail,
        trackTitle: externalPostedTrigger.trackTitle,
        bpm: externalPostedTrigger.bpm,
        grooveStyle: externalPostedTrigger.grooveStyle,
        milestoneTag: externalPostedTrigger.milestoneTag,
        platform: externalPostedTrigger.platform,
      }).catch(() => {
        // Fallback already covers local UI if offline
      });
    } else {
      const localItem: LocalActivityItem = {
        id: `local_${Date.now()}_${externalPostedTrigger.nonce}`,
        authorId: 'local_session',
        authorName,
        authorRole,
        activityType: externalPostedTrigger.activityType,
        title: externalPostedTrigger.title,
        detail: externalPostedTrigger.detail,
        trackTitle: externalPostedTrigger.trackTitle,
        bpm: externalPostedTrigger.bpm,
        grooveStyle: externalPostedTrigger.grooveStyle,
        milestoneTag: externalPostedTrigger.milestoneTag,
        platform: externalPostedTrigger.platform,
        likesCount: 0,
        commentsCount: 0,
        createdAtMs: Date.now(),
        isFirestoreDoc: false,
      };
      setLocalActivities((prev) => [localItem, ...prev.slice(0, 24)]);
    }
  }, [externalPostedTrigger, profile?.displayName, profile?.role, user]);

  // Derive project milestones from the user's saved music projects & community creators
  const derivedProjectMilestones = useMemo<LocalActivityItem[]>(() => {
    return projects.slice(0, 3).map((proj, idx) => ({
      id: `proj_ms_${proj.id}`,
      authorId: proj.ownerId,
      authorName: profile?.displayName || user?.displayName || 'Your Studio',
      authorRole: profile?.role || 'creator',
      activityType: 'milestone',
      title: `Project Milestone: "${proj.title}" saved in ${proj.genre}`,
      detail: proj.alignmentNotes
        ? `Alignment & session notes locked at ${proj.bpm} BPM: ${proj.alignmentNotes.slice(0, 140)}`
        : `Studio project "${proj.title}" (${proj.genre}) synced at ${proj.bpm} BPM.`,
      trackTitle: proj.title,
      bpm: proj.bpm,
      grooveStyle:
        proj.genre.toLowerCase().includes('house')
          ? 'house'
          : proj.genre.toLowerCase().includes('trap')
          ? 'trap'
          : 'afro',
      milestoneTag: proj.kitName ? `${proj.kitName} Kit` : 'Session Saved',
      likesCount: 4 + idx * 2,
      commentsCount: (localCommentsById[`proj_ms_${proj.id}`] || []).length,
      createdAtMs: Date.now() - 1000 * 60 * (25 + idx * 18),
      isFirestoreDoc: false,
    }));
  }, [projects, profile?.displayName, profile?.role, user?.displayName, localCommentsById]);

  const creatorSpotlightActivities = useMemo<LocalActivityItem[]>(() => {
    return creators
      .filter((c) => c.uid !== user?.uid)
      .slice(0, 2)
      .map((creator, idx) => ({
        id: `creator_act_${creator.uid}`,
        authorId: creator.uid,
        authorName: creator.displayName,
        authorRole: creator.role,
        activityType: 'interaction',
        title: `${creator.displayName} is active in the ${creator.role.toUpperCase()} lounge`,
        detail:
          creator.bio?.trim() ||
          `Connected with SoundDeck Studio as a ${creator.role}. Open for collabs, track feedback & BuymeSoda support.`,
        likesCount: 8 + idx * 5,
        commentsCount: (localCommentsById[`creator_act_${creator.uid}`] || []).length,
        createdAtMs: Date.now() - 1000 * 60 * (52 + idx * 15),
        isFirestoreDoc: false,
      }));
  }, [creators, user?.uid, localCommentsById]);

  const mergedFeed = useMemo<LocalActivityItem[]>(() => {
    const remoteMapped: LocalActivityItem[] = remoteActivities.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      authorName: r.authorName,
      authorRole: r.authorRole,
      activityType: r.activityType,
      title: r.title,
      detail: r.detail,
      trackTitle: r.trackTitle,
      bpm: r.bpm,
      grooveStyle: r.grooveStyle,
      milestoneTag: r.milestoneTag,
      platform: r.platform,
      likesCount: r.likesCount,
      commentsCount: r.commentsCount,
      createdAtMs: r.createdAtMs,
      isFirestoreDoc: true,
    }));

    const combined = [
      ...remoteMapped,
      ...localActivities,
      ...derivedProjectMilestones,
      ...creatorSpotlightActivities,
      ...SEEDED_COMMUNITY_FEED,
    ];

    const deduped = new Map<string, LocalActivityItem>();
    for (const item of combined) {
      if (!deduped.has(item.id)) {
        deduped.set(item.id, item);
      }
    }

    return Array.from(deduped.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [
    remoteActivities,
    localActivities,
    derivedProjectMilestones,
    creatorSpotlightActivities,
  ]);

  const visibleFeed = useMemo(() => {
    if (filter === 'all') return mergedFeed;
    return mergedFeed.filter((item) => item.activityType === filter);
  }, [mergedFeed, filter]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const fallbackTitle =
      postType === 'shared_track'
        ? `Shared "${postTrackTitle.trim() || activeTrackTitle}" (${studioBpm} BPM)`
        : postType === 'milestone'
        ? `Milestone Reached: ${postMilestoneTag}`
        : 'Community Studio Check-In';
    const finalTitle = postTitle.trim() || fallbackTitle;
    const finalDetail =
      postDetail.trim() ||
      (postType === 'shared_track'
        ? `Fresh ${postStyle.toUpperCase()} bounce at ${studioBpm} BPM. Listen & load straight into your deck!`
        : postType === 'milestone'
        ? `Locked "${postMilestoneTag}" on ${postTrackTitle.trim() || activeTrackTitle} inside SoundDeck Studio.`
        : 'Dropping into the Social Hub — looking for feedback and remix partners!');

    setPosting(true);
    setComposerNotice(null);
    const authorName = profile?.displayName || user?.displayName || 'Studio Creator';
    const authorRole = profile?.role || 'creator';

    try {
      if (user) {
        await publishCommunityActivity(user.uid, {
          authorName,
          authorRole,
          activityType: postType,
          title: finalTitle,
          detail: finalDetail,
          trackTitle: postType !== 'interaction' || postTrackTitle.trim() ? postTrackTitle.trim() : undefined,
          bpm: postType === 'shared_track' ? studioBpm : undefined,
          grooveStyle: postType === 'shared_track' ? postStyle : undefined,
          milestoneTag: postType === 'milestone' ? postMilestoneTag : undefined,
          platform: postType === 'shared_track' ? 'SoundDeck' : undefined,
        });
        setComposerNotice('Posted live to the Firestore Community Activity Feed!');
      } else {
        const newLocal: LocalActivityItem = {
          id: `local_${Date.now()}`,
          authorId: 'local_session',
          authorName,
          authorRole,
          activityType: postType,
          title: finalTitle,
          detail: finalDetail,
          trackTitle: postTrackTitle.trim() || undefined,
          bpm: postType === 'shared_track' ? studioBpm : undefined,
          grooveStyle: postType === 'shared_track' ? postStyle : undefined,
          milestoneTag: postType === 'milestone' ? postMilestoneTag : undefined,
          likesCount: 0,
          commentsCount: 0,
          createdAtMs: Date.now(),
          isFirestoreDoc: false,
        };
        setLocalActivities((prev) => [newLocal, ...prev]);
        setComposerNotice('Posted to your local Community Activity Feed (sign in to sync globally).');
      }
      setPostTitle('');
      setPostDetail('');
      setComposerOpen(false);
    } finally {
      setPosting(false);
    }
  };

  const handleToggleLike = async (item: LocalActivityItem) => {
    const currentlyLiked = Boolean(likedIds[item.id]);
    const nextLiked = !currentlyLiked;
    const nextCount = Math.max(0, item.likesCount + (nextLiked ? 1 : -1));

    setLikedIds((prev) => ({ ...prev, [item.id]: nextLiked }));

    if (item.isFirestoreDoc && user) {
      setRemoteActivities((prev) =>
        prev.map((r) => (r.id === item.id ? { ...r, likesCount: nextCount } : r))
      );
      try {
        await updateCommunityActivityLikes(item.id, nextCount);
      } catch {
        // Revert optimistic update on error
        setLikedIds((prev) => ({ ...prev, [item.id]: currentlyLiked }));
        setRemoteActivities((prev) =>
          prev.map((r) => (r.id === item.id ? { ...r, likesCount: item.likesCount } : r))
        );
      }
    } else {
      setLocalActivities((prev) =>
        prev.map((l) => (l.id === item.id ? { ...l, likesCount: nextCount } : l))
      );
    }
  };

  const handleAddReply = async (e: React.FormEvent, item: LocalActivityItem) => {
    e.preventDefault();
    const draft = (commentDrafts[item.id] || '').trim();
    if (!draft) return;

    const authorName = profile?.displayName || user?.displayName || 'Community Member';
    setCommentDrafts((prev) => ({ ...prev, [item.id]: '' }));

    if (item.isFirestoreDoc && user) {
      await addCommunityActivityComment(item.id, {
        authorId: user.uid,
        authorName,
        text: draft,
        currentCommentsCount: item.commentsCount,
      });
    } else {
      const nextReply = {
        id: `rep_${Date.now()}`,
        authorName,
        text: draft,
        createdAtMs: Date.now(),
      };
      setLocalCommentsById((prev) => ({
        ...prev,
        [item.id]: [...(prev[item.id] || []), nextReply],
      }));
      setLocalActivities((prev) =>
        prev.map((l) =>
          l.id === item.id ? { ...l, commentsCount: l.commentsCount + 1 } : l
        )
      );
    }
  };

  return (
    <section
      aria-labelledby="community-live-activity-heading"
      className="rounded-xl bg-[#13161B] border border-[#232833] p-5 space-y-5"
    >
      {/* Header & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#232833] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h3
              id="community-live-activity-heading"
              className="font-display text-lg font-semibold text-slate-100 flex items-center gap-2"
            >
              <Activity className="w-4 h-4 text-amber-400" />
              <span>Live Community Activity Feed</span>
            </h3>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{user ? 'Real-Time Sync' : 'Live Stream'}</span>
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Track community interactions, shared mixes, and project milestones in real time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#0B0D10] border border-[#232833]">
            {(
              [
                { id: 'all', label: 'All Activity' },
                { id: 'shared_track', label: 'Shared Tracks' },
                { id: 'milestone', label: 'Milestones' },
                { id: 'interaction', label: 'Interactions' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === tab.id
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setComposerOpen((v) => !v)}
            className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{composerOpen ? 'Close Post' : 'Share Activity'}</span>
          </button>
        </div>
      </div>

      {composerNotice && (
        <div className="p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-xs text-emerald-200">
          {composerNotice}
        </div>
      )}

      {/* Quick Community Share / Milestone Composer */}
      {composerOpen && (
        <form
          onSubmit={handleCreatePost}
          className="rounded-xl bg-[#0B0D10] border border-amber-500/35 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-amber-400">
              Post to Community Activity Feed
            </span>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#13161B] border border-[#232833]">
              {(
                [
                  { id: 'shared_track', label: 'Share Track' },
                  { id: 'milestone', label: 'Milestone' },
                  { id: 'interaction', label: 'Interaction' },
                ] as const
              ).map((kind) => (
                <button
                  key={kind.id}
                  type="button"
                  onClick={() => setPostType(kind.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    postType === kind.id
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {kind.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Activity Headline</label>
              <input
                type="text"
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
                maxLength={140}
                placeholder={
                  postType === 'shared_track'
                    ? `Shared "${postTrackTitle}" (${studioBpm} BPM)`
                    : postType === 'milestone'
                    ? `Milestone: ${postMilestoneTag}`
                    : 'Looking for vocal collab / mix feedback'
                }
                className="w-full px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            {postType === 'milestone' ? (
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Milestone Badge</label>
                <select
                  value={postMilestoneTag}
                  onChange={(e) => setPostMilestoneTag(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  {MILESTONE_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Track / Project Name</label>
                  <input
                    type="text"
                    value={postTrackTitle}
                    onChange={(e) => setPostTrackTitle(e.target.value)}
                    maxLength={120}
                    className="w-full px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Audio Vibe</label>
                  <select
                    value={postStyle}
                    onChange={(e) => setPostStyle(e.target.value as ActivityGrooveStyle)}
                    className="w-full px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="afro">Afrobeats</option>
                    <option value="house">Afro-House</option>
                    <option value="trap">Trap / 808</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Community Note</label>
            <textarea
              rows={2}
              value={postDetail}
              onChange={(e) => setPostDetail(e.target.value)}
              maxLength={600}
              placeholder="Share production details, invite stems, or celebrate a studio win..."
              className="w-full px-3 py-2 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {!user ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="text-[11px] text-amber-400 hover:underline"
              >
                Sign in to sync your post across the live community database
              </button>
            ) : (
              <span className="text-[11px] text-slate-400">
                Publishing as <strong className="text-slate-200">{profile?.displayName || user.displayName || 'Creator'}</strong>
              </span>
            )}
            <button
              type="submit"
              disabled={posting}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{posting ? 'Publishing...' : 'Post to Community'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Activity Feed Stream */}
      <div className="space-y-3">
        {visibleFeed.map((item) => {
          const isLiked = Boolean(likedIds[item.id]);
          const effectiveLikes = item.likesCount + (isLiked && !item.isFirestoreDoc ? 1 : 0);
          const isExpanded = expandedCommentId === item.id;
          const isPlaying = playingItemId === `act_${item.id}`;
          const itemComments = item.isFirestoreDoc
            ? remoteCommentsById[item.id] || []
            : localCommentsById[item.id] || [];
          const displayCommentCount = Math.max(item.commentsCount, itemComments.length);

          return (
            <article
              key={item.id}
              className="rounded-xl bg-[#0B0D10] border border-[#232833] hover:border-[#2E3544] p-4 space-y-3 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                      item.activityType === 'shared_track'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                        : item.activityType === 'milestone'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                    }`}
                  >
                    {item.activityType === 'shared_track' ? (
                      <Music2 className="w-4 h-4" />
                    ) : item.activityType === 'milestone' ? (
                      <Award className="w-4 h-4" />
                    ) : (
                      <Users className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-100">{item.authorName}</span>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#13161B] text-slate-400 border border-[#232833]">
                        {item.authorRole}
                      </span>
                      <span
                        className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                          item.activityType === 'shared_track'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            : item.activityType === 'milestone'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                        }`}
                      >
                        {item.activityType === 'shared_track'
                          ? 'Shared Track'
                          : item.activityType === 'milestone'
                          ? 'Project Milestone'
                          : 'Interaction'}
                      </span>
                      {item.milestoneTag && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-300">
                          <Sparkles className="w-3 h-3" />
                          {item.milestoneTag}
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-semibold text-slate-100 leading-snug">
                      {item.title}
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.detail}</p>
                  </div>
                </div>

                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                  {formatRelativeTime(item.createdAtMs)}
                </span>
              </div>

              {/* Embedded Track / Milestone Audio Bar */}
              {item.trackTitle && (
                <div className="rounded-lg bg-[#13161B] border border-[#232833] px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.grooveStyle && (
                      <button
                        type="button"
                        onClick={() => onToggleAudio(`act_${item.id}`, item.grooveStyle!)}
                        aria-label={isPlaying ? `Pause ${item.trackTitle}` : `Play ${item.trackTitle}`}
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          isPlaying
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-[#1B2028] hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-[#2A313E]'
                        }`}
                      >
                        {isPlaying ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5 ml-0.5" />
                        )}
                      </button>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-100 truncate">
                        ♫ {item.trackTitle}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                        {item.bpm ? <span>{item.bpm} BPM</span> : null}
                        {item.grooveStyle ? <span className="uppercase">{item.grooveStyle}</span> : null}
                        {item.platform ? (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <Radio className="w-3 h-3" />
                            {item.platform}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onLoadTrackIntoStudio({
                        trackTitle: item.trackTitle!,
                        headline: item.title,
                        caption: item.detail,
                      })
                    }
                    className="px-2.5 py-1 rounded bg-[#1B2028] hover:bg-[#252B36] text-amber-300 text-[11px] font-medium border border-[#2A313E] transition-colors whitespace-nowrap"
                  >
                    Load in Studio
                  </button>
                </div>
              )}

              {/* Community Engagement Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[#181C24]">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => handleToggleLike(item)}
                    className={`inline-flex items-center gap-1.5 text-xs transition-colors tabular-nums ${
                      isLiked ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-rose-400'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                    <span className="font-mono">{effectiveLikes}</span>
                    <span>Cheer</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCommentId((prev) => (prev === item.id ? null : item.id))
                    }
                    className={`inline-flex items-center gap-1.5 text-xs transition-colors tabular-nums ${
                      isExpanded ? 'text-amber-400 font-semibold' : 'text-slate-400 hover:text-amber-400'
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span className="font-mono">{displayCommentCount}</span>
                    <span>Engage</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onSupportCreator?.(item.authorName)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#13161B] hover:bg-amber-500/15 text-amber-400 border border-[#232833] text-[11px] font-medium transition-colors"
                >
                  <CupSoda className="w-3 h-3" />
                  <span>Tip on BuymeSoda</span>
                </button>
              </div>

              {/* Expandable Community Comments & Reply Thread */}
              {isExpanded && (
                <div className="pt-2 border-t border-[#1B2028] space-y-2.5">
                  {itemComments.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      No community replies yet. Start the conversation below.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {itemComments.map((c) => (
                        <div
                          key={c.id}
                          className="p-2 rounded-lg bg-[#13161B] border border-[#232833] text-xs flex items-baseline justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-amber-300 mr-1.5">
                              {c.authorName}:
                            </span>
                            <span className="text-slate-300">{c.text}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {formatRelativeTime(c.createdAtMs)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <form
                    onSubmit={(e) => handleAddReply(e, item)}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={commentDrafts[item.id] || ''}
                      onChange={(e) =>
                        setCommentDrafts((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      maxLength={400}
                      placeholder={
                        item.isFirestoreDoc && !user
                          ? 'Sign in to reply on live Firestore posts...'
                          : `Reply to ${item.authorName}...`
                      }
                      disabled={item.isFirestoreDoc && !user}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[#13161B] border border-[#232833] text-xs text-slate-100 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                    />
                    {item.isFirestoreDoc && !user ? (
                      <button
                        type="button"
                        onClick={onOpenAuth}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold shrink-0"
                      >
                        Sign In
                      </button>
                    ) : (
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1 shrink-0"
                      >
                        <Send className="w-3 h-3" />
                        <span>Reply</span>
                      </button>
                    )}
                  </form>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
