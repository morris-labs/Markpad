/// <reference types="vite/client" />
import type { MarkpadApi } from '@shared/api';

declare global {
  interface Window {
    readonly markpad: MarkpadApi;
  }
}
