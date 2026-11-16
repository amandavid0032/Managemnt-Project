/**
 * Turns an axios failure into a sentence a person can act on.
 *
 * The API's error envelope is `{ success: false, error: { code, message,
 * details? } }`, where `details` carries class-validator's per-field
 * messages. Those messages are written for humans ("countryCode must be a
 * 2-letter ISO-3166-1 alpha-2 code"), so surfacing the first one beats
 * replacing it with a generic "invalid input".
 *
 * `overrides` maps a status code to a better message for a specific screen —
 * a 401 means "wrong password" on the login form and "your session ended"
 * everywhere else.
 */
export function apiErrorMessage(error, { fallback = "Something went wrong.", overrides = {} } = {}) {
  if (error?.response) {
    const { status, data } = error.response;
    if (overrides[status]) return overrides[status];

    const details = data?.error?.details;
    if (Array.isArray(details) && details.length > 0) return details[0];

    const message = data?.error?.message;
    if (typeof message === "string" && message.length > 0) return message;

    if (status === 429) return "Too many requests. Please wait a minute and try again.";
    if (status === 403) return "You do not have permission to do that.";
    if (status === 404) return "That record no longer exists.";
    return fallback;
  }

  if (error?.code === "ECONNABORTED") return "The server took too long to respond.";
  return "Cannot reach the server. Is the API running on port 4000?";
}

/** Every validation message the API returned, for showing a whole form's worth. */
export function apiErrorDetails(error) {
  const details = error?.response?.data?.error?.details;
  return Array.isArray(details) ? details : [];
}
