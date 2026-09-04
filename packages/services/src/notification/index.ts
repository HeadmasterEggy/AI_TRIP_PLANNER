// Owner: E — NotificationService (stub)
// TODO(E): send real notifications (in-app toast bus, email, etc.).

export const notify = {
  async send(userId: string, message: string): Promise<void> {
    console.log(`[notify] ${userId}: ${message}`);
  },
};
