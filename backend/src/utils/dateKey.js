const pad2 = (value) => String(value).padStart(2, "0");

// Formats a JS Date into YYYY-MM-DD using the server's local timezone.
// This avoids off-by-one-day issues that happen with `toISOString()` in non-UTC timezones.
export const toLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
};

