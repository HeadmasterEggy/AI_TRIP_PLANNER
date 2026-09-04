// Owner: E — PreferenceMemoryService
// TODO(E): replace the in-memory Maps with a real store (SQLite via better-sqlite3,
//          or Redis). Keep implementing MemoryStore from @trip/shared so nothing
//          else has to change.

import type { ChatTurn, UserPreference, MemoryStore } from "@trip/shared";

const shortTerm = new Map<string, ChatTurn[]>(); // key: tripId  (session scratch)
const longTerm = new Map<string, UserPreference[]>(); // key: userId (confirmed profile)

export const memory: MemoryStore = {
  async getShortTerm(tripId) {
    return shortTerm.get(tripId) ?? [];
  },
  async appendShortTerm(tripId, turn) {
    shortTerm.set(tripId, [...(shortTerm.get(tripId) ?? []), turn]);
  },
  async getLongTerm(userId) {
    return longTerm.get(userId) ?? [];
  },
  async setLongTerm(userId, pref) {
    const existing = (longTerm.get(userId) ?? []).filter((p) => p.key !== pref.key);
    longTerm.set(userId, [...existing, pref]);
  },
  // TODO(E): promote a confirmed short-term item into long-term.
  async promote(_tripId, _userId, _key) {},
};
