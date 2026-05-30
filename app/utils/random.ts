/**
 * Returns a random number between min and max inclusively.
 */
export const random = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min
