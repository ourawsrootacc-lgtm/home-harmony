import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listMyMethods, addMethod, removeMethod, METHOD_LABEL, PaymentMethod, PaymentMethodRow,
} from "@/lib/payments";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export function PaymentMethodPicker() {
  const [rows, setRows] = useState<PaymentMethodRow[]>([]);
  const [kind, setKind] = useState<PaymentMethod>("easypaisa");
  const [title, setTitle] = useState("");
  const [num, setNum] = useState("");
  const [bank, setBank] = useState("");

  const load = () => listMyMethods().then(setRows);
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!title.trim()) return toast.error("Account title is required");
    if (kind !== "cash" && !num.trim()) return toast.error("Account number is required");
    const { error } = await addMethod({
      kind, account_title: title.trim(),
      account_number: kind === "cash" ? null : num.trim(),
      bank_name: kind === "bank" ? bank.trim() : null,
      is_default: rows.length === 0,
    });
    if (error) toast.error(error.message);
    else { toast.success("Method added"); setTitle(""); setNum(""); setBank(""); load(); }
  };
  const remove = async (id: string) => {
    const { error } = await removeMethod(id);
    if (error) toast.error(error.message); else load();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No payout methods yet.</p>}
        {rows.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded border p-2 text-sm">
            <div>
              <span className="font-medium">{METHOD_LABEL[m.kind]}</span>
              {m.bank_name && ` · ${m.bank_name}`} · {m.account_title}
              {m.account_number && ` · ${m.account_number}`}
            </div>
            <Button size="icon" variant="ghost" onClick={() => remove(m.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="rounded border p-3 space-y-3">
        <div className="font-medium text-sm">Add payout method</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Account title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {kind === "bank" && (
            <div>
              <Label>Bank name</Label>
              <Input value={bank} onChange={(e) => setBank(e.target.value)} />
            </div>
          )}
          {kind !== "cash" && (
            <div>
              <Label>Account number</Label>
              <Input value={num} onChange={(e) => setNum(e.target.value)} />
            </div>
          )}
        </div>
        <Button size="sm" onClick={add}>Add method</Button>
      </div>
    </div>
  );
}
