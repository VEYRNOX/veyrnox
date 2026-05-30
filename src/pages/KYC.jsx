import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Upload, Loader2, CheckCircle2, Clock, User, FileText, Camera } from "lucide-react";
import { toast } from "sonner";

const STEPS = ["Personal Info", "Document", "Selfie", "Review"];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
            i < current ? "bg-primary text-primary-foreground"
            : i === current ? "bg-primary/20 text-primary border border-primary"
            : "bg-secondary text-muted-foreground"
          }`}>
            {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
          </div>
          {i < STEPS.length - 1 && <div className={`h-px w-6 ${i < current ? "bg-primary" : "bg-border"}`} />}
        </div>
      ))}
    </div>
  );
}

function FileUploadButton({ label, onUpload, url, loading }) {
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    onUpload(file);
  };
  return (
    <label className={`flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
      url ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-secondary"
    }`}>
      <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {loading ? (
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      ) : url ? (
        <><CheckCircle2 className="h-6 w-6 text-primary" /><p className="text-xs text-primary font-medium">Uploaded</p></>
      ) : (
        <><Upload className="h-6 w-6 text-muted-foreground" /><p className="text-xs text-muted-foreground">{label}</p></>
      )}
    </label>
  );
}

export default function KYC() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ full_name: "", date_of_birth: "", nationality: "", address: "", document_type: "passport" });
  const [docFront, setDocFront] = useState("");
  const [docBack, setDocBack] = useState("");
  const [selfie, setSelfie] = useState("");
  const [uploading, setUploading] = useState({});

  const { data: kyc = [] } = useQuery({
    queryKey: ["kyc"],
    queryFn: () => base44.entities.KYCProfile.list(),
  });

  const submitKYC = useMutation({
    mutationFn: () => {
      const existing = kyc[0];
      const data = { ...form, document_front_url: docFront, document_back_url: docBack, selfie_url: selfie, status: "pending" };
      return existing ? base44.entities.KYCProfile.update(existing.id, data) : base44.entities.KYCProfile.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kyc"] });
      toast.success("KYC submitted for review");
    },
  });

  const uploadFile = async (file, field) => {
    setUploading(u => ({ ...u, [field]: true }));
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    if (field === "front") setDocFront(file_url);
    else if (field === "back") setDocBack(file_url);
    else setSelfie(file_url);
    setUploading(u => ({ ...u, [field]: false }));
  };

  const existing = kyc[0];

  if (existing?.status === "verified") {
    return (
      <div className="max-w-sm mx-auto text-center py-16 space-y-4">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <ShieldCheck className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Identity Verified</h2>
        <p className="text-sm text-muted-foreground">Your KYC is complete. You have full access to all features.</p>
      </div>
    );
  }

  if (existing?.status === "pending" || submitKYC.isSuccess) {
    return (
      <div className="max-w-sm mx-auto text-center py-16 space-y-4">
        <div className="h-20 w-20 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto">
          <Clock className="h-10 w-10 text-yellow-500" />
        </div>
        <h2 className="text-xl font-bold">{submitKYC.isSuccess ? "Submitted!" : "Under Review"}</h2>
        <p className="text-sm text-muted-foreground">We're reviewing your documents. This usually takes 1–2 business days.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Identity Verification</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Complete KYC to unlock full wallet access</p>
      </div>

      <StepIndicator current={step} />

      {step === 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2"><User className="h-4 w-4 text-primary" /><h2 className="font-semibold">Personal Information</h2></div>
          <div><Label>Full Name</Label><Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="As on official document" className="mt-1.5" /></div>
          <div><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} className="mt-1.5" /></div>
          <div><Label>Nationality</Label><Input value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} placeholder="Country" className="mt-1.5" /></div>
          <div><Label>Residential Address</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street, City, Country" className="mt-1.5" /></div>
          <Button className="w-full" disabled={!form.full_name || !form.date_of_birth || !form.nationality} onClick={() => setStep(1)}>Continue</Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2"><FileText className="h-4 w-4 text-primary" /><h2 className="font-semibold">Identity Document</h2></div>
          <div>
            <Label>Document Type</Label>
            <Select value={form.document_type} onValueChange={v => setForm(f => ({ ...f, document_type: v }))}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="passport">Passport</SelectItem>
                <SelectItem value="national_id">National ID</SelectItem>
                <SelectItem value="drivers_license">{"Driver's License"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="mb-2 block">Front of Document</Label><FileUploadButton label="Upload front" onUpload={f => uploadFile(f, "front")} url={docFront} loading={uploading.front} /></div>
          <div><Label className="mb-2 block">Back of Document</Label><FileUploadButton label="Upload back" onUpload={f => uploadFile(f, "back")} url={docBack} loading={uploading.back} /></div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>Back</Button>
            <Button className="flex-1" disabled={!docFront || !docBack} onClick={() => setStep(2)}>Continue</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2"><Camera className="h-4 w-4 text-primary" /><h2 className="font-semibold">Selfie Verification</h2></div>
          <p className="text-sm text-muted-foreground">Take a clear photo of yourself holding your document. Ensure your face and document are clearly visible.</p>
          <FileUploadButton label="Upload selfie with document" onUpload={f => uploadFile(f, "selfie")} url={selfie} loading={uploading.selfie} />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
            <Button className="flex-1" disabled={!selfie} onClick={() => setStep(3)}>Continue</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-semibold">Review and Submit</h2>
          <div className="space-y-2 text-sm">
            {[["Full Name", form.full_name], ["Date of Birth", form.date_of_birth], ["Nationality", form.nationality], ["Document", form.document_type]].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-medium capitalize">{v}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Documents</span>
              <div className="flex gap-2">
                {docFront && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Front</span>}
                {docBack && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Back</span>}
                {selfie && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Selfie</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Back</Button>
            <Button className="flex-1" disabled={submitKYC.isPending} onClick={() => submitKYC.mutate()}>
              {submitKYC.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Submit KYC
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}