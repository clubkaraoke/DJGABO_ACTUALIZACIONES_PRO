const MONTHS: Record<number, string> = {
  1: "ENERO", 2: "FEBRERO", 3: "MARZO", 4: "ABRIL",
  5: "MAYO", 6: "JUNIO", 7: "JULIO", 8: "AGOSTO",
  9: "SEPTIEMBRE", 10: "OCTUBRE", 11: "NOVIEMBRE", 12: "DICIEMBRE",
};

export function coverFor(year: number, month: number): string | null {
  if (![2024, 2025, 2026].includes(year)) return null;
  const name = MONTHS[month];
  if (!name) return null;
  const mm = String(month).padStart(2, "0");
  return `/covers/actualizaciones/${year}/${mm}_${name}_${year}.webp`;
}

export const primaryYears = [2026, 2025, 2024, 2023, 2022, 2021];
export const moreYears = [2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012];
