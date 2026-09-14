export const ARTISTS = [
  "Grupo 5",
  "Armonía 10",
  "Agua Marina",
  "Corazón Serrano",
  "Los Ilegales",
  "Hermanos Yaipén",
  "Marisol y Grupo Trébol",
  "La Tropicalísima Oriental",
  "D'Mondo",
  "Los Mirlos",
  "Explosión de Iquitos",
  "Zaperoko",
  "Grupo Niche",
  "Elvis Crespo",
  "Sonora Dinamita",
];

export const TITLES = [
  "Motor y Motivo",
  "El Amor Más Bonito",
  "Cuando Se Va el Amor",
  "Cadena de Amor",
  "Cariñito",
  "Cerveza y Vodka",
  "La Faldita",
  "Cielo Nublado",
  "Cumbia del Adiós",
  "Cómo Olvidarte",
  "Cuando Te Vi",
  "Cuando Tú No Estás",
  "Ya No Vuelvas",
  "Cariño Bonito",
  "Dile",
  "Sopa de Caracol",
  "Suavemente",
  "La Bilirrubina",
  "Cavernícola",
  "Nuestro Amor",
];

export const GENRES = ["Cumbia", "Salsa", "Huayno", "Tropical", "Merengue"];

export const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** 12 colecciones mensuales: Octubre 2025 → Septiembre 2026 (punto 27). */
export const SEED_MONTHS: Array<{ year: number; month: number }> = [
  { year: 2025, month: 10 },
  { year: 2025, month: 11 },
  { year: 2025, month: 12 },
  { year: 2026, month: 1 },
  { year: 2026, month: 2 },
  { year: 2026, month: 3 },
  { year: 2026, month: 4 },
  { year: 2026, month: 5 },
  { year: 2026, month: 6 },
  { year: 2026, month: 7 },
  { year: 2026, month: 8 },
  { year: 2026, month: 9 },
];

export function monthFolderName(month: number): string {
  return `${String(month).padStart(2, "0")} ${MONTH_NAMES_ES[month - 1].toUpperCase()}`;
}

export function buildStorageKey(year: number, month: number, artist: string, title: string): string {
  return `/ACTUALIZACIONES/${year}/${monthFolderName(month)}/${artist.toUpperCase()} - ${title.toUpperCase()}.mp4`;
}
