export function requestUrl(): Promise<never> {
  return Promise.reject(
    new Error("The Obsidian requestUrl test stub must be mocked by the calling test.")
  );
}
