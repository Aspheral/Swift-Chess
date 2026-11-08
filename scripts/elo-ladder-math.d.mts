export interface EloCalibrationGame {
  opponentElo: number;
  result: string;
}
export interface EloCalibrationBlock {
  opening: string;
  games: EloCalibrationGame[];
}
export function score(result: string): number;
export function expected(swiftRating: number, opponentRating: number): number;
export function fitElo(
  games: EloCalibrationGame[],
  lower?: number,
  upper?: number,
): number;
export function seededRandom(seed: number): () => number;
export function pairedBootstrap(
  blocks: EloCalibrationBlock[],
  repeats?: number,
  seed?: number,
): [number, number];
export function openingFamilyBootstrap(
  blocks: EloCalibrationBlock[],
  repeats?: number,
  seed?: number,
): [number, number] | null;
