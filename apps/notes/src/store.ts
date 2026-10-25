import { MemoryStore } from "@societyos/sync";

// One store per app session. Swap for the SQLite + sync store once the
// backend is set up (see docs/architecture.md).
export const store = new MemoryStore();
export const ME = "local-user";
