import { api } from "./api";

/** Attach Clerk session JWT to every API call. */
export function bindClerkTokenGetter(getToken) {
  api.getToken = typeof getToken === "function" ? getToken : null;
}

export function clearClerkTokenGetter() {
  api.getToken = null;
}
