import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { propertySchema } from "@/lib/validators";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader } from "@/components/feedback/Feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PK_CITIES, PROPERTY_TYPES } from "@/lib/constants";
import { z } from "zod";
import { toast } from "sonner";
import { validateImage } from "@/lib/validators";
import { ImagePlus, X } from "lucide-react";
import { DocumentUploader } from "@/components/documents/DocumentUploader";
import { DocumentList } from "@/components/documents/DocumentList";
import {
  uploadPropertyDoc, listPropertyDocs, deletePropertyDoc,
  PROPERTY_DOC_LABEL, type PropertyDoc, type PropertyDocKind,
} from "@/lib/documents";

type FV = z.infer<typeof propertySchema>;

export default function LandlordListingForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const { user } = useAuth();
  const [images, setImages] = useState<{ id?: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FV>({
    resolver: zodResolver(propertySchema),
    defaultValues: { type: "apartment", city: "Karachi", bedrooms: 2, bathrooms: 1, area_sqft: 800, lat: 24.8607, lng: 67.0011, deposit: 0 },
  });
  const type = watch("type"); const city = watch("city");
  const [propDocs, setPropDocs] = useState<PropertyDoc[]>([]);
  const refreshDocs = () => { if (id) listPropertyDocs(id).then(setPropDocs); };
  useEffect(() => { refreshDocs(); }, [id]);

  useEffect(() => {
    if (!editing) return;
    supabase.from("properties").select("*, property_images(id,url,sort_order)").eq("id", id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        reset({
          title: data.title, description: data.description, type: data.type, bedrooms: data.bedrooms,
          bathrooms: data.bathrooms, area_sqft: data.area_sqft, address: data.address, city: data.city,
          lat: data.lat, lng: data.lng, monthly_rent: data.monthly_rent, deposit: data.deposit,
        });
        setImages((data.property_images ?? []).sort((a: any,b: any) => a.sort_order - b.sort_order));
      });
  }, [id, editing, reset]);

  const handleFiles = async (files: FileList | null, propertyId: string) => {
    if (!files || !user) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      const err = validateImage(f);
      if (err) { toast.error(err); continue; }
      const path = `${user.id}/${propertyId}/${Date.now()}-${f.name}`;
      const { error } = await supabase.storage.from("property-images").upload(path, f);
      if (error) { toast.error(error.message); continue; }
      const { data: { publicUrl } } = supabase.storage.from("property-images").getPublicUrl(path);
      const { data: row } = await supabase.from("property_images").insert({
        property_id: propertyId, url: publicUrl, sort_order: images.length,
      }).select().single();
      setImages((prev) => [...prev, { id: row?.id, url: publicUrl }]);
    }
    setUploading(false);
  };

  const removeImage = async (img: { id?: string; url: string }) => {
    if (img.id) await supabase.from("property_images").delete().eq("id", img.id);
    setImages((prev) => prev.filter((x) => x.url !== img.url));
  };

  const onSubmit = async (v: FV) => {
    if (!user) return;
    if (editing) {
      const { error } = await supabase.from("properties").update({ ...v }).eq("id", id);
      if (error) return toast.error(error.message);
      toast.success("Listing updated"); nav("/app/landlord/listings");
    } else {
      const { data, error } = await supabase.from("properties").insert({
        ...v, landlord_id: user.id, status: "active",
      }).select().single();
      if (error) return toast.error(error.message);
      toast.success("Listing created"); nav(`/app/landlord/listings/${data.id}/edit`);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title={editing ? "Edit listing" : "New listing"} description="Provide accurate details so tenants can find your property." />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 rounded-xl border bg-card p-6">
        <div>
          <Label>Title</Label>
          <Input {...register("title")} placeholder="2-bed apartment in DHA Phase 5" />
          {errors.title && <p className="text-xs text-destructive mt-1">{errors.title.message}</p>}
        </div>
        <div>
          <Label>Description</Label>
          <Textarea rows={4} {...register("description")} />
          {errors.description && <p className="text-xs text-destructive mt-1">{errors.description.message}</p>}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setValue("type", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PROPERTY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>City</Label>
            <Select value={city} onValueChange={(v) => setValue("city", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PK_CITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Bedrooms</Label><Input type="number" {...register("bedrooms")} /></div>
          <div><Label>Bathrooms</Label><Input type="number" {...register("bathrooms")} /></div>
          <div><Label>Area (sq ft)</Label><Input type="number" {...register("area_sqft")} /></div>
          <div><Label>Monthly rent (PKR)</Label><Input type="number" {...register("monthly_rent")} /></div>
          <div><Label>Deposit (PKR)</Label><Input type="number" {...register("deposit")} /></div>
        </div>
        <div>
          <Label>Address</Label>
          <Input {...register("address")} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Latitude</Label><Input type="number" step="any" {...register("lat")} />{errors.lat && <p className="text-xs text-destructive mt-1">{errors.lat.message}</p>}</div>
          <div><Label>Longitude</Label><Input type="number" step="any" {...register("lng")} />{errors.lng && <p className="text-xs text-destructive mt-1">{errors.lng.message}</p>}</div>
        </div>

        {editing && (
          <div>
            <Label>Photos</Label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
              {images.map((img) => (
                <div key={img.url} className="relative aspect-[4/3] rounded-md overflow-hidden border">
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => removeImage(img)} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-background/90 grid place-items-center">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="aspect-[4/3] rounded-md border-2 border-dashed grid place-items-center text-muted-foreground cursor-pointer hover:border-primary hover:text-primary">
                <ImagePlus className="h-5 w-5" />
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files, id!)} />
              </label>
            </div>
            {uploading && <p className="text-xs text-muted-foreground mt-2">Uploading…</p>}
          </div>
        )}

        {editing && id && (
          <div>
            <Label>Property documents</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Shared with tenants only after you approve their application or activate a lease.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {(Object.keys(PROPERTY_DOC_LABEL) as PropertyDocKind[]).map((k) => (
                <DocumentUploader
                  key={k}
                  label={`Upload ${PROPERTY_DOC_LABEL[k]}`}
                  onPick={async (f) => {
                    await uploadPropertyDoc(id, f, k);
                    refreshDocs();
                  }}
                />
              ))}
            </div>
            <DocumentList
              rows={propDocs}
              table="property_documents"
              canDelete
              onDelete={async (docId) => { await deletePropertyDoc(docId); refreshDocs(); }}
              showViews
            />
          </div>
        )}

        <div className="flex gap-2">
          <Button disabled={isSubmitting}>{editing ? "Save changes" : "Create listing"}</Button>
          <Button type="button" variant="outline" onClick={() => nav("/app/landlord/listings")}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
