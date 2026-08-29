// canvas-confetti ships JavaScript as its type entrypoint. This declaration
// prevents the app's checkJs pass from type-checking the dependency source.
type ConfettiOptions = Record<string, unknown>;

declare const confetti: (options?: ConfettiOptions) => Promise<unknown> | null;

export default confetti;
