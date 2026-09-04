// Owner: E — AuthService (stub)
// TODO(E): real auth later. For now every request is the demo user.

export interface SessionUser {
  id: string;
  displayName: string;
}

export const auth = {
  async currentUser(): Promise<SessionUser> {
    return { id: "demo-user", displayName: "Demo User" };
  },
};
