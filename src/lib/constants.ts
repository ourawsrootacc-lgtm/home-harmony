export const PK_CITIES = [
  "Karachi",
  "Lahore",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Multan",
  "Peshawar",
  "Quetta",
  "Hyderabad",
  "Gujranwala",
  "Sialkot",
];

export const PROPERTY_TYPES = [
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "portion", label: "Portion" },
  { value: "studio", label: "Studio" },
  { value: "commercial", label: "Commercial" },
] as const;

export const ROLE_LABELS: Record<string, string> = {
  tenant: "Tenant",
  landlord: "Landlord",
  maintenance: "Maintenance Staff",
  admin: "Administrator",
};
