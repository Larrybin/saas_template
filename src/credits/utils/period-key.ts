export function getPeriodKey(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return year * 100 + month;
}

export function getCurrentPeriodKey(refDate: Date = new Date()): number {
  return getPeriodKey(refDate);
}
