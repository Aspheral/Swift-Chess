import { SwiftEngine as BaseSwiftEngine } from "./engine";

/**
 * Principal Variation Search engine.
 *
 * SwiftEngine's search core already performs PVS: the first move is searched
 * with a full window and later moves use a null-window probe with a full
 * re-search on fail-high. Keep this named export as the explicit PVS entry
 * point without maintaining a second, divergent root implementation.
 */
export class PvsSwiftEngine extends BaseSwiftEngine {}
