import type { YukaBridge } from '../shared/protocol';

declare global {
  interface Window {
    yuka: YukaBridge;
  }
}
