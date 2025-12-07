const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "UTC",
});

export function formatDateTime(dateInput: string | number | Date) {
  return dateTimeFormatter.format(new Date(dateInput));
}
