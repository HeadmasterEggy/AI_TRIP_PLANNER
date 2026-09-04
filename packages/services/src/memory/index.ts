// Owner: E — PreferenceMemoryService
// TODO(E): replace the in-memory Maps with a real store (SQLite via better-sqlite3,
//          or Redis). Keep the same method signatures so nothing else has to change.

import type { ChatTurn, UserPreference } from "@trip/shared";

const shortTerm = new Map<string, ChatTurn[]>(); // key: tripId  (session scratch)
const longTerm = new Map<string, UserPreference[]>(); // key: userId (confirmed profile)

export const memory = {
  async getShortTerm(tripId: string): Promise<ChatTurn[]> {
    return shortTerm.get(tripId) ?? [];
  },
  async appendShortTerm(tripId: string, turn: ChatTurn): Promise<void> {
    shortTerm.set(tripId, [...(shortTerm.get(tripId) ?? []), turn]);
  },
  async getLongTerm(userId: string): Promise<UserPreference[]> {
    return longTerm.get(userId) ?? [];
  },
  async setLongTerm(userId: string, pref: UserPreference): Promise<void> {
    const existing = (longTerm.get(userId) ?? []).filter((p) => p.key !== pref.key);
    longTerm.set(userId, [...existing, pref]);
  },
  /** TODO(E): promote a confirmed short-term item into long-term. */
  async promote(_tripId: string, _userId: string, _key: string): Promise<void> {},
};
