import { useState } from 'react';
import { useTags } from '../hooks/useTags.js';

const THEMES = [
  '', 'Gameplay', 'Skill / Mechanics', 'Hype / Social Proof', 'UGC', 'Social',
];

export default function TagEditor({ asset, tag, onClose }) {
  const [theme, setTheme] = useState(tag.theme || '');
  const [notes, setNotes] = useState(tag.notes || '');
  const [rating, setRating] = useState(tag.rating || '');
  const { saveTag, saving } = useTags();
  const [saved, setSaved] = useState(false);

  if (!asset) return null;

  async function handleSave() {
    if (!asset.youtubeId) return;
    await saveTag(asset.youtubeId, { theme, notes, rating });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="p-4 flex items-start gap-6">
      <div className="flex-1 flex gap-4 items-start flex-wrap">
        {/* Theme */}
        <div>
          <label className="font-mono text-[9px] uppercase tracking-wider text-muted block mb-1">Theme</label>
          <select
            value={theme}
            onChange={e => setTheme(e.target.value)}
            className="bg-surface border border-border rounded px-2 py-1.5 text-text text-[12px] font-mono outline-none focus:border-[rgba(232,255,71,0.4)]"
          >
            {THEMES.map(t => (
              <option key={t} value={t}>{t || '-- None --'}</option>
            ))}
          </select>
        </div>

        {/* Rating */}
        <div>
          <label className="font-mono text-[9px] uppercase tracking-wider text-muted block mb-1">Rating</label>
          <select
            value={rating}
            onChange={e => setRating(e.target.value)}
            className="bg-surface border border-border rounded px-2 py-1.5 text-text text-[12px] font-mono outline-none focus:border-[rgba(232,255,71,0.4)]"
          >
            <option value="">-- Auto --</option>
            <option value="Best">Best</option>
            <option value="Good">Good</option>
            <option value="Low">Low</option>
          </select>
        </div>

        {/* Notes */}
        <div className="flex-1 min-w-[200px]">
          <label className="font-mono text-[9px] uppercase tracking-wider text-muted block mb-1">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add notes..."
            className="w-full bg-surface border border-border rounded px-2 py-1.5 text-text text-[12px] font-sans outline-none focus:border-[rgba(232,255,71,0.4)] placeholder:text-muted"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 items-center pt-4">
        <button
          onClick={handleSave}
          disabled={saving || !asset.youtubeId}
          className="bg-accent text-[#0a0c0f] font-mono text-[11px] font-bold uppercase tracking-wide px-4 py-1.5 rounded cursor-pointer hover:opacity-85 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
        </button>
        <button
          onClick={onClose}
          className="font-mono text-[11px] text-muted hover:text-text cursor-pointer px-2 py-1.5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
