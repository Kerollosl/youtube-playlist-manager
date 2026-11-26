// Type-only declarations for the typecheck script; not shipped or loaded by the extension.
interface Window {
  /** YouTube's page config object, present in the MAIN world only. */
  ytcfg?: { get?(name: string): any; [key: string]: any };
}

/** YouTube's Polymer custom elements expose their model as `data` and a `set` method. */
interface PolymerElement extends HTMLElement {
  data?: any;
  set(path: string, value: unknown): void;
}
