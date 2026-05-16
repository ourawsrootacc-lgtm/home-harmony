import { z } from "zod";
import { PK_CITIES } from "@/lib/constants";

export const pkPhoneRegex = /^\+92\d{10}$/;
export const cnicRegex = /^\d{5}-\d{7}-\d$/;

export const phoneSchema = z
  .string()
  .regex(pkPhoneRegex, "Use format +92XXXXXXXXXX (e.g. +923001234567)");

export const cnicSchema = z
  .string()
  .regex(cnicRegex, "Use format 12345-1234567-1");

export const signupSchema = z.object({
  full_name: z.string().min(2, "Enter your full name").max(80),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Minimum 8 characters"),
  phone: phoneSchema,
  cnic: cnicSchema.optional().or(z.literal("")),
  role: z.enum(["tenant", "landlord", "maintenance"]),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password required"),
});

export const propertySchema = z.object({
  title: z.string().min(4).max(120),
  description: z.string().min(10).max(2000),
  type: z.enum(["apartment", "house", "portion", "studio", "commercial"]),
  bedrooms: z.coerce.number().int().min(0).max(20),
  bathrooms: z.coerce.number().int().min(0).max(20),
  area_marlas: z.coerce.number().min(0.5).max(2000),
  address: z.string().min(5).max(200),
  city: z.enum(PK_CITIES as unknown as [string, ...string[]]),
  society: z.string().max(80).optional().or(z.literal("")),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  monthly_rent: z.coerce.number().int().min(1000).max(9999999999),
  deposit: z.coerce.number().int().min(0).max(9999999999),
});

export const maintenanceSchema = z.object({
  category: z.enum(["plumbing", "electrical", "appliance", "structural", "other"]),
  priority: z.enum(["low", "medium", "high"]),
  description: z.string().min(10).max(1000),
});

export const validateImage = (file: File): string | null => {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    return "Only PNG, JPEG or WEBP images allowed";
  if (file.size > 5 * 1024 * 1024) return "Image must be 5 MB or smaller";
  return null;
};
