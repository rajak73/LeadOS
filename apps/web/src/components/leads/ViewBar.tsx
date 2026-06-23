'use client';

import { useState } from 'react';
import { useLeadsStore } from '@/lib/store/leads-store';

export function ViewBar() {
  const { savedPresets, loadPreset, deletePreset, savePreset, resetFilters } = useLeadsStore();
  const [isNaming, setIsNaming] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [activeView, setActiveView] = useState<string | null>(null);

  const handleLoad = (name: string) => {
    loadPreset(name);
    setActiveView(name);
  };

  const handleDelete = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deletePreset(name);
    if (activeView === name) {
      setActiveView(null);
      resetFilters();
    }
  };

  const handleSave = () => {
    const name = newViewName.trim();
    if (!name) return;
    savePreset(name);
    setActiveView(name);
    setNewViewName('');
    setIsNaming(false);
  };

  const handleAll = () => {
    resetFilters();
    setActiveView(null);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap" aria-label="Saved views">
      {/* All leads tab */}
      <button
        type="button"
        onClick={handleAll}
        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors
          ${activeView === null
            ? 'bg-primary-500 text-white shadow-sm'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-subtle'
          }`}
        data-testid="view-all"
      >
        All Leads
      </button>

      {/* Saved view tabs */}
      {savedPresets.map((preset) => (
        <div
          key={preset.name}
          className={`flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-lg text-xs font-medium
                      transition-colors group
            ${activeView === preset.name
              ? 'bg-primary-500 text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-subtle'
            }`}
        >
          <button
            type="button"
            onClick={() => handleLoad(preset.name)}
            data-testid={`view-${preset.name}`}
          >
            {preset.name}
          </button>
          <button
            type="button"
            onClick={(e) => handleDelete(preset.name, e)}
            aria-label={`Delete ${preset.name} view`}
            className={`opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity
                        w-4 h-4 flex items-center justify-center rounded
              ${activeView === preset.name ? 'hover:bg-white/20' : 'hover:bg-bg-base'}`}
          >
            ×
          </button>
        </div>
      ))}

      {/* Save current view */}
      {isNaming ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') { setIsNaming(false); setNewViewName(''); }
            }}
            placeholder="View name…"
            autoFocus
            className="px-2 py-1 rounded-lg border border-border bg-bg-base text-xs
                       text-text-primary placeholder:text-text-tertiary
                       focus:outline-none focus:border-primary-500 w-32 transition-colors"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!newViewName.trim()}
            className="px-2 py-1 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs
                       font-medium transition-colors disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => { setIsNaming(false); setNewViewName(''); }}
            className="px-2 py-1 rounded-lg text-xs text-text-tertiary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsNaming(true)}
          data-testid="save-view"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-text-tertiary
                     hover:text-text-primary hover:bg-bg-subtle transition-colors border border-dashed border-border/50"
        >
          <span>+</span>
          Save view
        </button>
      )}
    </div>
  );
}
