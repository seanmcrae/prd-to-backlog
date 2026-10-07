export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    body: string,
  ) {
    super(`${provider} request failed with HTTP ${status}: ${body.slice(0, 300)}`);
    this.name = "ProviderError";
  }
}

export async function postJson(
  fetchImpl: FetchLike,
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new ProviderError(provider, response.status, text);
  return JSON.parse(text) as unknown;
}
