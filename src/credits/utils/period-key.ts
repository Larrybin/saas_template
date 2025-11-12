export function getPeriodKey(date: Date): number {
  return date.getFullYear() * 100 + (date.getMonth() + 1);
}
