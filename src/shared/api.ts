/** The API that the preload script exposes to the renderer as `window.markpad`. */
export interface MarkpadApi {
  readonly platform: NodeJS.Platform;
  getVersion(): Promise<string>;
}
