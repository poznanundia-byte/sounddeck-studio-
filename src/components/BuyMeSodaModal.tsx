import { useState } from 'react';
import { X, CupSoda, ExternalLink, Heart } from 'lucide-react';
import { type User } from 'firebase/auth';
import { createSodaSupportPledge, type CreatorProfile } from '../firebase';

interface BuyMeSodaModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  creators: CreatorProfile[];
  initialRecipient?: {
    handle: string;
    name: string;
    role: 'artist' | 'creator' | 'dj' | 'owner';
  };
  onOpenAuth: () => void;
}

const SODA_TIERS = [
  { count: 1, label: 'Classic Craft Soda', price: 3 },
  { count: 3, label: 'Studio Session Pack', price: 9 },
  { count: 5, label: 'Mastering Crate', price: 15 },
];

export function BuyMeSodaModal({
  isOpen,
  onClose,
  user,
  creators,
  initialRecipient,
  onOpenAuth,
}: BuyMeSodaModalProps) {
  const [selectedHandle, setSelectedHandle] = useState(
    initialRecipient?.handle || 'sounddeck-owner'
  );
  const [selectedRole, setSelectedRole] = useState<'artist' | 'creator' | 'dj' | 'owner'>(
    initialRecipient?.role || 'owner'
  );
  const [sodaCount, setSodaCount] = useState(1);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const recipients = [
    {
      handle: 'sounddeck-owner',
      name: 'Webapp Owner · SoundDeck Studio',
      role: 'owner' as const,
    },
    ...creators
      .filter((c) => c.buyMeSodaHandle && c.buyMeSodaHandle.trim().length > 0)
      .map((c) => ({
        handle: c.buyMeSodaHandle!.trim(),
        name: `${c.displayName} (${c.role})`,
        role: c.role,
      })),
  ];

  const amountUsd = sodaCount * 3;
  const externalBuyMeSodaUrl = `https://www.buymesoda.com/${encodeURIComponent(selectedHandle)}`;

  const handleRecordSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setReceipt(null);

    if (!user) {
      onOpenAuth();
      return;
    }

    setSubmitting(true);
    try {
      await createSodaSupportPledge({
        supporterId: user.uid,
        supporterName: user.displayName || user.email || 'Studio Member',
        recipientHandle: selectedHandle,
        recipientRole: selectedRole,
        sodaCount,
        amountUsd,
        message,
      });
      setReceipt(
        `Pledged ${sodaCount} soda${sodaCount > 1 ? 's' : ''} ($${amountUsd}) to @${selectedHandle}. Complete your tip directly on BuymeSoda below.`
      );
      setMessage('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save pledge.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="BuymeSoda Creator and Owner Support"
    >
      <div className="w-full max-w-lg rounded-xl bg-[#13161B] border border-[#232833] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#232833]">
          <div className="flex items-center gap-2.5">
            <CupSoda className="w-5 h-5 text-amber-400" />
            <h2 className="font-display text-lg font-semibold text-slate-100">
              BuymeSoda Support Hub
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#1B2028] transition-colors"
            aria-label="Close BuymeSoda modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleRecordSupport} className="p-6 space-y-5">
          <p className="text-xs text-slate-400 leading-relaxed">
            Fuel independent artists, content creators, DJs, and the SoundDeck Studio webapp owner with BuymeSoda tips.
          </p>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/60 text-xs text-red-200">
              {errorMsg}
            </div>
          )}

          {receipt && (
            <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-xs text-emerald-200 space-y-2">
              <p>{receipt}</p>
              <a
                href={externalBuyMeSodaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-amber-400 hover:underline"
              >
                <span>Open @{selectedHandle} on BuymeSoda</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Recipient</label>
            <select
              value={selectedHandle}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedHandle(val);
                const found = recipients.find((r) => r.handle === val);
                if (found) setSelectedRole(found.role);
              }}
              className="w-full px-3 py-2.5 rounded-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            >
              {recipients.map((r) => (
                <option key={r.handle} value={r.handle}>
                  {r.name} (@{r.handle})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Choose Soda Pack</label>
            <div className="grid grid-cols-3 gap-2">
              {SODA_TIERS.map((tier) => (
                <button
                  key={tier.count}
                  type="button"
                  onClick={() => setSodaCount(tier.count)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    sodaCount === tier.count
                      ? 'bg-amber-500/15 border-amber-500 text-slate-100'
                      : 'bg-[#0B0D10] border-[#232833] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-mono text-sm font-bold text-amber-400 tabular-nums">
                    ${tier.price}
                  </div>
                  <div className="text-xs font-medium mt-0.5">{tier.count} Soda{tier.count > 1 ? 's' : ''}</div>
                  <div className="text-[11px] text-slate-500 truncate">{tier.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Shoutout Note (Optional)</label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={280}
              placeholder="Love the new mix and beat pack!"
              className="w-full px-3 py-2 rounded-lg bg-[#0B0D10] border border-[#232833] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Heart className="w-4 h-4" />
              <span>
                {user
                  ? submitting
                    ? 'Logging Support...'
                    : `Support ($${amountUsd})`
                  : 'Sign In to Log & Support'}
              </span>
            </button>
            <a
              href={externalBuyMeSodaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-4 rounded-lg bg-[#1B2028] hover:bg-[#252B36] text-slate-100 text-sm font-medium border border-[#2A313E] flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <span>Visit BuymeSoda</span>
              <ExternalLink className="w-4 h-4 text-amber-400" />
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
