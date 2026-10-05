export const sum = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((t, x) => t + f(x), 0)
export const round2 = (n: number) => Math.round(n * 100) / 100
export const byId = <T extends { id: string }>(arr: T[], id: string) => arr.find(x => x.id === id)
export const DAY = 864e5
