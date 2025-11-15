// TypeScript declaration for remote Pyodide ESM in a module worker context.
// Allows: await import('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.mjs')
declare module "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.mjs" {
  // Minimal shape needed by the worker
  export function loadPyodide(options: {
    indexURL: string;
    stdin?: (msg: string) => void;
    stdout?: (msg: string) => void;
    stderr?: (msg: string) => void;
  }): Promise<any>;
}