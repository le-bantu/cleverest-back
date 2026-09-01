export const NOTIFIER = Symbol('NOTIFIER');

export interface NotificationEvent {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** opt-in: also deliver by email */
  email?: {
    to: string;
    subject: string;
    text: string;
  };
}

/**
 * Delivers notifications to a user. `database` channel always; `mail`
 * channel opt-in per event via `NotificationEvent.email`.
 */
export abstract class NotifierPort {
  abstract notify(userId: string, event: NotificationEvent): Promise<void>;
}
