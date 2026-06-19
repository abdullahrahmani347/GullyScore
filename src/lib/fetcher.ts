/**
 * Safe SWR fetcher that checks response.ok before parsing JSON.
 *
 * Without this check, a 500 error response body like {error: "..."} gets
 * silently treated as valid data, causing rendering bugs or crashes.
 */
export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(errorBody.error || `HTTP ${res.status}`);
  }
  return res.json();
}
