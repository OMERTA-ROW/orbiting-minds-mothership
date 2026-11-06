/** Browser intake manifest for OMNI Marketing. Stored in this browser only — never Desktop sync. */
export const CATEGORIES = [
  "Games",
  "Websites",
  "Books",
  "Music",
  "Movies",
  "Crypto",
  "Apps",
  "Ecommerce",
  "Services",
  "Courses",
  "Events",
  "Marketing",
  "Tools",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number] | "Inbox";
export const MAX_FILE_BYTES = 5_000_000;
export const MAX_FILES = 200;

const RULES: [Category, RegExp][] = [
  ["Games", /\.(unity|uproject|godot|tscn|gd|pck)$|(^|\/)(assets\/scenes|levels)\//i],
  ["Books", /\.(epub|mobi|docx?)$|manuscript|chapter|kdp|ingramspark/i],
  ["Music", /\.(wav|flac|mp3|aiff|als|flp|logicx)$|stems?\//i],
  ["Movies", /\.(mov|mp4|mkv|prproj|drp|fcpxml)$|footage\//i],
  ["Websites", /(^|\/)(index\.html|package\.json|vite\.config\.\w+)$/i],
  ["Crypto", /\.sol$|hardhat|foundry\.toml/i],
];

/** Confident only when exactly one category matches; otherwise Inbox for review. */
export function classify(paths: string[]): Category {
  const hits = new Set<Category>();
  for (const p of paths) for (const [c, re] of RULES) if (re.test(p)) hits.add(c);
  return hits.size === 1 ? [...hits][0]! : "Inbox";
}

export function safeRelative(path: string): string | null {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length || parts.some((p) => p === ".." || p === "." || p.includes("\0"))) return null;
  if (parts[0] === "Omni Projects" || parts.includes(".omni-manifest")) return null; // no self-import
  return parts.join("/");
}

export type ManagedFile = {
  path: string;
  sha256: string;
  bytes: number;
  version: number;
  importedAt: string;
};
export type IntakeProject = {
  id: string;
  name: string;
  category: Category;
  source: string;
  files: ManagedFile[];
  history: string[];
};
export type IncomingFile = { path: string; bytes: number; sha256: string };
export type ImportReport = {
  added: number;
  unchanged: number;
  versioned: number;
  rejected: { path: string; reason: string }[];
};

/** Unchanged hashes skip; same path with a new hash becomes a new version; nothing is overwritten. */
export function importInto(
  project: IntakeProject,
  incoming: IncomingFile[],
  now: string,
): { project: IntakeProject; report: ImportReport } {
  const report: ImportReport = { added: 0, unchanged: 0, versioned: 0, rejected: [] };
  const files = [...project.files];
  if (incoming.length > MAX_FILES)
    return {
      project,
      report: { ...report, rejected: [{ path: "*", reason: `More than ${MAX_FILES} files` }] },
    };
  for (const f of incoming) {
    const path = safeRelative(f.path);
    if (!path) {
      report.rejected.push({ path: f.path, reason: "Unsafe or self-referencing path" });
      continue;
    }
    if (f.bytes > MAX_FILE_BYTES) {
      report.rejected.push({ path, reason: `Over ${MAX_FILE_BYTES} bytes` });
      continue;
    }
    const same = files.filter((m) => m.path === path);
    if (same.some((m) => m.sha256 === f.sha256)) {
      report.unchanged++;
      continue;
    }
    files.push({
      path,
      sha256: f.sha256,
      bytes: f.bytes,
      version: same.length + 1,
      importedAt: now,
    });
    if (same.length) report.versioned++;
    else report.added++;
  }
  const line = `${now} import: +${report.added} new, ${report.versioned} versioned, ${report.unchanged} unchanged, ${report.rejected.length} rejected`;
  return { project: { ...project, files, history: [...project.history, line] }, report };
}

export function recategorize(p: IntakeProject, category: Category, now: string): IntakeProject {
  return {
    ...p,
    category,
    history: [...p.history, `${now} moved to ${category} (managed record only; source untouched)`],
  };
}

export const INTAKE_KEY = "evolution.omni-intake.v1";
export function loadIntake(raw: string | null): IntakeProject[] {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return v?.version === 1 && Array.isArray(v.projects) ? v.projects : [];
  } catch {
    return [];
  }
}
export const saveIntake = (projects: IntakeProject[]) => JSON.stringify({ version: 1, projects });

export const COMPANION_REQUIRED = [
  "Resolve the real Desktop/Omni Projects folder",
  "Write Originals/Working copies to disk",
  "Watch selected source folders",
  "Open project/category/source folders",
] as const;
