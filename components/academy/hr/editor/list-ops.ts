// Pure list edits for the module editor. Each returns a new array.

export const replaceAt = <T,>(list: readonly T[], index: number, value: T): T[] =>
  list.map((item, i) => (i === index ? value : item))

export const removeAt = <T,>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index)

export const insertAt = <T,>(list: readonly T[], index: number, value: T): T[] => [
  ...list.slice(0, index),
  value,
  ...list.slice(index),
]

/** Swaps an item with its neighbour; the same contents when it is already at that end. */
export function moveBy<T>(list: readonly T[], index: number, step: -1 | 1): T[] {
  const target = index + step
  if (target < 0 || target >= list.length) return [...list]
  return list.map((item, i) => (i === index ? list[target] : i === target ? list[index] : item))
}
