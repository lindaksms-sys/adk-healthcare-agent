import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, Trash2, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { listClinicStaff, inviteStaffMember, removeStaffMember } from "@/lib/staff.functions";
import { useCurrentMembership, displayName, roleLabel, type StaffMember, type ClinicRole } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/dashboard/staff")({
  head: () => ({ meta: [{ title: "Staff — Clinic Intake Copilot" }] }),
  component: StaffPage,
});

function StaffPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useCurrentMembership();
  const isAdmin = me.data?.role === "clinic_admin";

  const list = useServerFn(listClinicStaff);
  const invite = useServerFn(inviteStaffMember);
  const remove = useServerFn(removeStaffMember);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["clinic_staff"],
    queryFn: () => list() as Promise<StaffMember[]>,
  });

  const inviteMut = useMutation({
    mutationFn: (input: { email: string; role: ClinicRole; full_name?: string; job_title?: string }) =>
      invite({ data: input }),
    onSuccess: () => {
      toast.success("Invite sent");
      qc.invalidateQueries({ queryKey: ["clinic_staff"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Invite failed"),
  });

  const removeMut = useMutation({
    mutationFn: (membership_id: string) => remove({ data: { membership_id } }),
    onSuccess: () => {
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: ["clinic_staff"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Remove failed"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" />
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-[1100px] px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard" })} className="-ml-2">
            <ArrowLeft className="h-4 w-4" /> Cases
          </Button>
          <div className="h-5 w-px bg-border" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wider">
              <Users className="h-3 w-3" /> Team
            </div>
            <h1 className="text-sm font-semibold">Clinic staff</h1>
          </div>
          {isAdmin && <InviteDialog onSubmit={(v) => inviteMut.mutate(v)} pending={inviteMut.isPending} />}
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 py-6">
        {!isAdmin && (
          <p className="mb-4 text-xs text-muted-foreground">
            You're viewing your clinic team. Only clinic admins can invite or remove members.
          </p>
        )}
        {isError && (
          <div className="mb-4 rounded-lg border border-emergency/20 bg-emergency-soft px-4 py-3 text-sm text-emergency">
            Couldn't load staff.
          </div>
        )}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid grid-cols-12 gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <div className="col-span-4">Name</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-2 text-right">Open cases</div>
            <div className="col-span-1" />
          </div>
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-3"><Skeleton className="h-6 w-full" /></div>
              ))}
            </div>
          ) : (data ?? []).length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">No staff yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {(data ?? []).map((m) => (
                <div key={m.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3 text-sm">
                  <div className="col-span-4 min-w-0">
                    <div className="font-medium truncate">{displayName(m)}</div>
                    {m.job_title && <div className="text-xs text-muted-foreground truncate">{m.job_title}</div>}
                  </div>
                  <div className="col-span-3 truncate text-muted-foreground">{m.email ?? "—"}</div>
                  <div className="col-span-2">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                      m.role === "clinic_admin"
                        ? "border-foreground/20 bg-foreground/5 text-foreground"
                        : "border-border bg-muted text-muted-foreground"
                    }`}>
                      {roleLabel(m.role)}
                    </span>
                  </div>
                  <div className="col-span-2 text-right tabular-nums">{m.assigned_open_count}</div>
                  <div className="col-span-1 text-right">
                    {isAdmin && m.user_id !== me.data?.user_id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-emergency">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {displayName(m)}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              They will lose access to this clinic. Their account is not deleted.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeMut.mutate(m.id)}>Remove</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function InviteDialog({
  onSubmit, pending,
}: {
  onSubmit: (v: { email: string; role: ClinicRole; full_name?: string; job_title?: string }) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ClinicRole>("staff");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    onSubmit({
      email: email.trim(),
      role,
      full_name: fullName.trim() || undefined,
      job_title: jobTitle.trim() || undefined,
    });
    setOpen(false);
    setEmail(""); setFullName(""); setJobTitle(""); setRole("staff");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="h-4 w-4" /> Invite staff</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a staff member</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="pl-8" placeholder="nurse@clinic.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Full name</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Sister Ndlovu" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Job title</label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Nurse" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as ClinicRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="clinic_admin">Clinic admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send invite"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
