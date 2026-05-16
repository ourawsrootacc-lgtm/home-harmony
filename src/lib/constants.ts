export const PK_CITIES = [
  "Karachi",
  "Lahore",
  "Islamabad",
  "Peshawar",
  "Quetta",
] as const;

export type PkCity = (typeof PK_CITIES)[number];

export const PK_SOCIETIES: Record<PkCity, string[]> = {
  Karachi: [
    "DHA",
    "Clifton",
    "Gulshan-e-Iqbal",
    "Bahria Town Karachi",
    "Gulberg Town",
    "Malir",
    "North Nazimabad",
    "PECHS",
    "Scheme 33",
    "Other",
  ],
  Lahore: [
    "DHA",
    "Bahria Town",
    "Gulberg",
    "Model Town",
    "Johar Town",
    "Wapda Town",
    "Askari",
    "Cantt",
    "Valencia",
    "Other",
  ],
  Islamabad: [
    "F-6", "F-7", "F-8", "F-10", "F-11",
    "G-9", "G-10", "G-11", "G-13",
    "E-11",
    "Bahria Town",
    "DHA",
    "Other",
  ],
  Peshawar: [
    "Hayatabad",
    "University Town",
    "DHA Peshawar",
    "Regi Model Town",
    "Cantt",
    "Other",
  ],
  Quetta: [
    "Cantt",
    "Jinnah Town",
    "Satellite Town",
    "Chaman Housing",
    "Samungli Road",
    "Other",
  ],
};

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

// 1 Marla ≈ 272.25 sq ft (standard Pakistani conversion)
export const SQFT_PER_MARLA = 272.25;
export const sqftToMarlas = (sqft: number | null | undefined): number =>
  sqft == null ? 0 : Math.round((Number(sqft) / SQFT_PER_MARLA) * 100) / 100;
export const marlasToSqft = (marlas: number | null | undefined): number =>
  marlas == null ? 0 : Math.round(Number(marlas) * SQFT_PER_MARLA);
