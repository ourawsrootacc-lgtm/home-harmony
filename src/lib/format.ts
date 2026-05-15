export const formatPKR = (amount: number | null | undefined): string => {
  if (amount == null || isNaN(Number(amount))) return "Rs —";
  return "Rs " + Number(amount).toLocaleString("en-PK");
};

export const formatDate = (input: string | Date | null | undefined): string => {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" });
};

export const relativeTime = (input: string | Date): string => {
  const d = typeof input === "string" ? new Date(input) : input;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
};
