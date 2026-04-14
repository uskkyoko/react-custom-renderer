// Teach TypeScript about the custom Flutter element types used in JSX.
// Without this, <container>, <text>, etc. would be type errors.
declare namespace JSX {
  interface IntrinsicElements {
    container: Record<string, unknown>;
    text: Record<string, unknown>;
    button: Record<string, unknown>;
    listitem: Record<string, unknown>;
    input: Record<string, unknown>;
  }
}
