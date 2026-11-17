import { useEffect, useState } from 'react';
import {
  Users,
  MessageSquare,
  GitBranch,
  Shield,
  Plus,
  RotateCcw,
  Share2,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  saveOrUpdateCollaborationRoom,
  subscribeOwnedCollaborations,
  subscribeInvitedCollaborations,
  type StudioCollaborationRecord,
} from '../../firebase';
import type {
  CollabRoleAssignment,
  ProjectVersionSnapshot,
  SampleRightsLedgerItem,
  TrackCommentItem,
} from '../../types/studioPro';

interface CollabRightsPanelProps {
  user: User | null;
  projectTitle: string;
  bpm: number;
  musicalKey: string;
  lyrics: string;
  trackNames: string[];
  collaborators: CollabRoleAssignment[];
  comments: TrackCommentItem[];
  versions: ProjectVersionSnapshot[];
  rightsLedger: SampleRightsLedgerItem[];
  onChangeCollaborators: (next: CollabRoleAssignment[]) => void;
  onChangeComments: (next: TrackCommentItem[]) => void;
  onChangeVersions: (next: ProjectVersionSnapshot[]) => void;
  onRestoreVersion: (snap: ProjectVersionSnapshot) => void;
  onOpenAuth: () => void;
}

export function CollabRightsPanel({
  user,
  projectTitle,
  bpm,
  musicalKey,
  lyrics,
  trackNames,
  collaborators,
  comments,
  versions,
  rightsLedger,
  onChangeCollaborators,
  onChangeComments,
  onChangeVersions,
  onRestoreVersion,
  onOpenAuth,
}: CollabRightsPanelProps) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'producer' | 'artist' | 'engineer'>('artist');
  const [inviteSplit, setInviteSplit] = useState(25);

  const [commentTrack, setCommentTrack] = useState(trackNames[0] || 'Master Bus');
  const [commentTimeSec, setCommentTimeSec] = useState(0);
  const [commentText, setCommentText] = useState('');

  const [versionLabel, setVersionLabel] = useState('v1.1 Hook & Vocal Mix');
  const [activeCollabId, setActiveCollabId] = useState<string | null>(null);
  const [ownedRooms, setOwnedRooms] = useState<StudioCollaborationRecord[]>([]);
  const [invitedRooms, setInvitedRooms] = useState<StudioCollaborationRecord[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setOwnedRooms([]);
      setInvitedRooms([]);
      return;
    }
    const unsubOwned = subscribeOwnedCollaborations(user.uid, setOwnedRooms);
    const unsubInvited = user.email
      ? subscribeInvitedCollaborations(user.email, setInvitedRooms)
      : () => {};
    return () => {
      unsubOwned();
      unsubInvited();
    };
  }, [user?.uid, user?.email]);

  const mergedRooms = Array.from(
    new Map([...ownedRooms, ...invitedRooms].map((r) => [r.id, r])).values()
  ).sort((a, b) => b.updatedAtMs - a.updatedAtMs);

  const syncRoomToFirestore = async (
    nextCollabs: CollabRoleAssignment[],
    nextComments: TrackCommentItem[],
    nextVersions: ProjectVersionSnapshot[]
  ) => {
    if (!user) return;
    setSyncing(true);
    setErrorMsg(null);
    try {
      const payloadJson = JSON.stringify({
        collaborators: nextCollabs,
        comments: nextComments,
        versions: nextVersions,
        lyrics: lyrics.slice(0, 4000),
      });
      const id = await saveOrUpdateCollaborationRoom(user.uid, {
        collabId: activeCollabId || undefined,
        projectTitle,
        bpm,
        musicalKey,
        collaboratorEmails: nextCollabs.map((c) => c.email),
        stateJson: payloadJson,
      });
      setActiveCollabId(id);
      setStatusMsg('Synced collaboration room, roles, comments, and version history live via Firestore.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to sync collaboration room.');
    } finally {
      setSyncing(false);
    }
  };

  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = inviteEmail.trim().toLowerCase();
    if (!cleanEmail) return;
    const nextItem: CollabRoleAssignment = {
      id: `col_${Date.now()}`,
      email: cleanEmail,
      displayName: inviteName.trim() || cleanEmail.split('@')[0],
      role: inviteRole,
      splitPct: Math.max(0, Math.min(100, inviteSplit)),
      addedAtIso: new Date().toISOString(),
    };
    const nextList = [nextItem, ...collaborators.filter((c) => c.email !== cleanEmail)];
    onChangeCollaborators(nextList);
    setInviteEmail('');
    setInviteName('');
    await syncRoomToFirestore(nextList, comments, versions);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const item: TrackCommentItem = {
      id: `cmt_${Date.now()}`,
      trackName: commentTrack || 'Master Bus',
      timestampSec: Math.max(0, commentTimeSec),
      authorName: user?.displayName || user?.email?.split('@')[0] || 'Studio Member',
      role: 'producer',
      comment: commentText.trim(),
      createdAtIso: new Date().toISOString(),
    };
    const next = [item, ...comments];
    onChangeComments(next);
    setCommentText('');
    await syncRoomToFirestore(collaborators, next, versions);
  };

  const handleSaveSnapshot = async () => {
    const snap: ProjectVersionSnapshot = {
      id: `ver_${Date.now()}`,
      label: versionLabel.trim() || `v1.${versions.length + 1}`,
      summary: `${bpm} BPM · ${musicalKey} · ${trackNames.length} tracks`,
      bpm,
      musicalKey,
      lyrics,
      createdBy: user?.displayName || 'Producer',
      createdAtIso: new Date().toISOString(),
    };
    const next = [snap, ...versions];
    onChangeVersions(next);
    await syncRoomToFirestore(collaborators, comments, next);
  };

  const handleOpenRoom = (room: StudioCollaborationRecord) => {
    setActiveCollabId(room.id);
    try {
      const parsed = JSON.parse(room.stateJson) as {
        collaborators?: CollabRoleAssignment[];
        comments?: TrackCommentItem[];
        versions?: ProjectVersionSnapshot[];
      };
      if (parsed.collaborators) onChangeCollaborators(parsed.collaborators);
      if (parsed.comments) onChangeComments(parsed.comments);
      if (parsed.versions) onChangeVersions(parsed.versions);
      setStatusMsg(`Loaded live shared room "${room.projectTitle}".`);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-5">
      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-200">
          {errorMsg}
        </div>
      )}
      {statusMsg && (
        <div className="p-3 rounded-lg bg-sky-950/40 border border-sky-700/60 text-xs text-sky-200">
          {statusMsg}
        </div>
      )}

      {/* Collaborator Invites & Roles + Real-Time Shared Rooms */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-6 rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              <div>
                <h4 className="font-display text-base font-semibold text-slate-100">
                  Collaboration Workspace &amp; Splits
                </h4>
                <p className="text-[11px] text-slate-400">
                  Invite producers, artists &amp; engineers via email · Real-time Firestore room sync
                </p>
              </div>
            </div>
            {user ? (
              <button
                type="button"
                onClick={() => syncRoomToFirestore(collaborators, comments, versions)}
                disabled={syncing}
                className="px-3 py-1.5 rounded-lg bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 text-xs font-semibold flex items-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{syncing ? 'Syncing...' : 'Share / Sync Room'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold"
              >
                Sign In to Collaborate
              </button>
            )}
          </div>

          <form onSubmit={handleAddCollaborator} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="collaborator@email.com"
              required
              className="sm:col-span-2 px-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-slate-100"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'producer' | 'artist' | 'engineer')}
              className="px-2.5 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-slate-100"
            >
              <option value="producer">Producer</option>
              <option value="artist">Artist / Vocalist</option>
              <option value="engineer">Mix Engineer</option>
            </select>
            <div className="flex gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                value={inviteSplit}
                onChange={(e) => setInviteSplit(Number(e.target.value))}
                className="w-14 px-2 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-slate-100 font-mono"
                title="Ownership Split %"
              />
              <button
                type="submit"
                className="flex-1 px-2.5 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 font-semibold flex items-center justify-center"
                title="Invite Collaborator"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </form>

          <div className="space-y-1.5">
            <div className="p-2.5 rounded-lg bg-[#090B10] border border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-100">{user?.displayName || 'Project Owner'}</span>
                <span className="text-slate-500 ml-2 font-mono">{user?.email || 'Local Session'}</span>
              </div>
              <span className="text-[11px] font-mono text-purple-300">OWNER · PRIMARY RIGHTS</span>
            </div>
            {collaborators.map((c) => (
              <div
                key={c.id}
                className="p-2.5 rounded-lg bg-[#090B10] border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-medium text-slate-200">{c.displayName}</span>
                  <span className="text-slate-500 ml-2 font-mono">{c.email}</span>
                </div>
                <span className="text-[11px] font-mono text-sky-300 uppercase">
                  {c.role} · {c.splitPct}%
                </span>
              </div>
            ))}
          </div>

          {mergedRooms.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              <div className="text-[11px] font-mono text-slate-400">
                Active Shared Collaboration Rooms ({mergedRooms.length})
              </div>
              {mergedRooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleOpenRoom(r)}
                  className={`w-full p-2.5 rounded-lg border text-left text-xs flex items-center justify-between ${
                    activeCollabId === r.id
                      ? 'bg-[#151927] border-purple-500/50'
                      : 'bg-[#090B10] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span className="font-medium text-slate-100">{r.projectTitle}</span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {r.collaboratorEmails.length} invited · {r.bpm} BPM
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Track Comments & Project Version History */}
        <div className="xl:col-span-6 rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
            <MessageSquare className="w-4 h-4 text-sky-400" />
            <div>
              <h4 className="font-display text-base font-semibold text-slate-100">
                Track Notes &amp; Version History
              </h4>
              <p className="text-[11px] text-slate-400">
                Leave timestamped mix feedback &amp; snapshot immutable project checkpoints
              </p>
            </div>
          </div>

          <form onSubmit={handleAddComment} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            <select
              value={commentTrack}
              onChange={(e) => setCommentTrack(e.target.value)}
              className="px-2.5 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-slate-100"
            >
              <option value="Master Bus">Master Bus</option>
              {trackNames.map((tn, idx) => (
                <option key={idx} value={tn}>
                  {tn}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step={1}
              value={commentTimeSec}
              onChange={(e) => setCommentTimeSec(Number(e.target.value))}
              placeholder="Sec"
              className="px-2.5 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-slate-100 font-mono"
            />
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Leave timestamp note..."
              className="sm:col-span-2 px-3 py-2 rounded-lg bg-[#090B10] border border-slate-800 text-slate-100"
            />
          </form>

          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-xs text-slate-500">No track comments posted yet.</p>
            ) : (
              comments.map((cm) => (
                <div
                  key={cm.id}
                  className="p-2.5 rounded-lg bg-[#090B10] border border-slate-800 text-xs flex justify-between gap-2"
                >
                  <div>
                    <span className="font-mono text-sky-400">@{cm.timestampSec}s · {cm.trackName}:</span>{' '}
                    <span className="text-slate-200">{cm.comment}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0">{cm.authorName}</span>
                </div>
              ))
            )}
          </div>

          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-purple-400" />
              <input
                type="text"
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#090B10] border border-slate-800 text-xs text-slate-100"
              />
              <button
                type="button"
                onClick={handleSaveSnapshot}
                className="px-3 py-1.5 rounded-lg bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 text-xs font-semibold whitespace-nowrap"
              >
                Save Version Snapshot
              </button>
            </div>

            {versions.length > 0 && (
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="p-2 rounded bg-[#090B10] border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-medium text-slate-200">{v.label}</span>
                      <span className="text-[10px] font-mono text-slate-500 ml-2">{v.summary}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRestoreVersion(v)}
                      className="px-2 py-1 rounded bg-[#151923] hover:bg-slate-800 text-sky-300 text-[11px] flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restore</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rights, Ownership & Sample License Provenance Ledger */}
      <div className="rounded-xl bg-[#0F1219] border border-slate-800/80 p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
          <Shield className="w-4 h-4 text-emerald-400" />
          <div>
            <h4 className="font-display text-base font-semibold text-slate-100">
              Rights, Ownership &amp; Sample License Provenance Ledger
            </h4>
            <p className="text-[11px] text-slate-400">
              Creators retain full ownership of original works. Uploaded external audio is explicitly flagged unless cleared.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          {rightsLedger.length === 0 ? (
            <p className="text-xs text-slate-500">
              Audio sources added to timeline tracks are automatically audited here for licensing status.
            </p>
          ) : (
            rightsLedger.map((item) => (
              <div
                key={item.id}
                className="p-2.5 rounded-lg bg-[#090B10] border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-medium text-slate-100">{item.sourceName}</span>
                  <span className="text-[11px] text-slate-400 ml-2">{item.attribution}</span>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                    item.verifiedRoyaltyFree
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/50'
                      : 'bg-amber-950/60 text-amber-300 border border-amber-700/50'
                  }`}
                >
                  {item.verifiedRoyaltyFree ? 'ORIGINAL / ROYALTY-FREE' : 'CLEARANCE REQUIRED BEFORE COMMERCIAL RELEASE'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
