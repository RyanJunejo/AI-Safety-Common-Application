import { InventoryRecord, type Program, type Question } from './schema';

const modules = import.meta.glob<{ default: unknown }>('./inventory/*.json', { eager: true });

/** Display order: open visible forms first, then programs whose forms are closed. */
export const PROGRAM_ORDER = [
  'anthropic-fellows',
  'iliad',
  'iaps',
  'lasr',
  'mats',
  'spar',
  'pibbss',
  'pivotal',
] as const;

function load(): InventoryRecord[] {
  const records = Object.entries(modules).map(([path, mod]) => {
    const parsed = InventoryRecord.safeParse(mod.default);
    if (!parsed.success) {
      throw new Error(`Invalid inventory record ${path}:\n${parsed.error.message}`);
    }
    return parsed.data;
  });
  const rank = (id: string) => {
    const i = (PROGRAM_ORDER as readonly string[]).indexOf(id);
    return i === -1 ? PROGRAM_ORDER.length : i;
  };
  return records.sort((a, b) => rank(a.program.id) - rank(b.program.id));
}

export const INVENTORY: readonly InventoryRecord[] = load();
export const PROGRAMS: readonly Program[] = INVENTORY.map((r) => r.program);
export const QUESTIONS: readonly Question[] = INVENTORY.flatMap((r) => r.questions);

const programById = new Map(PROGRAMS.map((p) => [p.id, p]));
const questionsByProgram = new Map(INVENTORY.map((r) => [r.program.id, r.questions]));

export function getProgram(id: string): Program | undefined {
  return programById.get(id);
}

export function questionsFor(programId: string): readonly Question[] {
  return questionsByProgram.get(programId) ?? [];
}

/** Every distinct location named by any program, for the dossier's location preferences. */
export const ALL_LOCATIONS: readonly string[] = [...new Set(PROGRAMS.flatMap((p) => p.locations))].sort();
