// A calendar day (YYYY-MM-DD) as Turkish readers write it: "7 Kasım 2026". Read at noon UTC and
// shown in Istanbul time, so the day never shifts with the device's zone.
export const longDay = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
