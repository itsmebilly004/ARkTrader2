// Local subset replacing the original rxjs-based stream. The visual editor
// only needs a BehaviorSubject-shaped value-and-subscribe API; we avoid pulling
// rxjs in for a single use site.

type Subscriber<T> = (value: T) => void;

class MiniBehaviorSubject<T> {
  private value_: T;
  private subscribers = new Set<Subscriber<T>>();

  constructor(initial: T) {
    this.value_ = initial;
  }

  getValue(): T {
    return this.value_;
  }

  next(value: T): void {
    this.value_ = value;
    this.subscribers.forEach((fn) => {
      try {
        fn(value);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[connection-status-stream] subscriber threw", err);
      }
    });
  }

  subscribe(fn: Subscriber<T>): { unsubscribe: () => void } {
    fn(this.value_);
    this.subscribers.add(fn);
    return { unsubscribe: () => this.subscribers.delete(fn) };
  }
}

export enum CONNECTION_STATUS {
  OPENED = "opened",
  CLOSED = "closed",
  UNKNOWN = "unknown",
}

export type AuthData = {
  loginid?: string;
  account_list?: unknown[];
  currency?: string;
  is_virtual?: number;
  email?: string;
};

export const connectionStatus$ = new MiniBehaviorSubject<string>(CONNECTION_STATUS.UNKNOWN);
export const isAuthorizing$ = new MiniBehaviorSubject<boolean>(false);
export const isAuthorized$ = new MiniBehaviorSubject<boolean>(false);
export const account_list$ = new MiniBehaviorSubject<unknown[]>([]);
export const authData$ = new MiniBehaviorSubject<AuthData | null>(null);

export const setConnectionStatus = (status: CONNECTION_STATUS): void => {
  connectionStatus$.next(status);
};

export const setIsAuthorized = (value: boolean): void => {
  isAuthorized$.next(value);
};

export const setIsAuthorizing = (value: boolean): void => {
  isAuthorizing$.next(value);
};

export const setAccountList = (list: unknown[]): void => {
  account_list$.next(list);
};

export const setAuthData = (data: AuthData | null): void => {
  if (data?.loginid && typeof window !== "undefined") {
    window.localStorage.setItem("active_loginid", data.loginid);
  }
  authData$.next(data);
};
