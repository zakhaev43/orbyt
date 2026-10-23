type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeAuth(callback: Listener) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function usernameSnapshot(): string | null {
  return localStorage.getItem("username");
}

export function isLoggedInSnapshot(): boolean {
  return Boolean(localStorage.getItem("access_token"));
}

export function getAccessToken(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem("access_token");
}

export function getRefreshToken(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem("refresh_token");
}

export function saveSession(session: {
  access_token: string;
  refresh_token: string;
  user: { username: string };
}) {
  localStorage.setItem("access_token", session.access_token);
  localStorage.setItem("refresh_token", session.refresh_token);
  localStorage.setItem("username", session.user.username);
  notify();
}

export function saveAccessToken(accessToken: string) {
  localStorage.setItem("access_token", accessToken);
}

export function clearSession() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("username");
  notify();
}
