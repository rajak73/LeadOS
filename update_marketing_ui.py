import os
import glob

replacements = {
    "bg-bg-base": "bg-slate-50",
    "bg-bg-elevated": "bg-white",
    "bg-bg-subtle": "bg-slate-50",
    "bg-bg-overlay": "bg-white",
    "text-text-primary": "text-slate-900",
    "text-text-secondary": "text-slate-600",
    "text-text-tertiary": "text-slate-500",
    "border-border-default": "border-slate-200",
    "border-border-subtle": "border-slate-200",
    "border-border-strong": "border-slate-200",
}

files_to_update = [
    "apps/web/src/app/(marketing)/layout.tsx",
    "apps/web/src/app/(marketing)/page.tsx",
    "apps/web/src/app/(marketing)/pricing/page.tsx",
]

for filepath in files_to_update:
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            content = f.read()
        for old, new in replacements.items():
            content = content.replace(old, new)
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")
