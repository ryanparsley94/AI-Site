import { useState, useEffect } from "react";
import { useGetCompany, useUpdateCompany } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Settings() {
  const { data: company, isLoading } = useGetCompany();
  const updateCompany = useUpdateCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    website: "",
    timezone: "America/New_York"
  });

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name || "",
        phone: company.phone || "",
        email: company.email || "",
        address: company.address || "",
        website: company.website || "",
        timezone: company.timezone || "America/New_York"
      });
    }
  }, [company]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = () => {
    updateCompany.mutate({ data: formData }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/company'] });
        toast({ title: "Company profile updated" });
      }
    });
  };

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-secondary">Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your company profile and preferences.</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <Building2 size={24} />
              </div>
              <div>
                <CardTitle>Company Profile</CardTitle>
                <CardDescription>This information is used by your AI assistants when talking to customers.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Company Name</Label>
                <Input id="name" name="name" value={formData.name} onChange={handleChange} />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Main Phone Number</Label>
                <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} />
                <p className="text-[10px] text-muted-foreground">The number your AI will answer and transfer to.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Public Email</Label>
                <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input id="website" name="website" value={formData.website} onChange={handleChange} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Headquarters Address</Label>
                <Input id="address" name="address" value={formData.address} onChange={handleChange} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select value={formData.timezone} onValueChange={(v) => setFormData(prev => ({...prev, timezone: v}))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                    <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">Used for scheduling jobs and after-hours routing.</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t bg-muted/20 pt-4 flex justify-end">
            <Button onClick={handleSave} disabled={updateCompany.isPending} className="gap-2 font-bold px-6">
              <Save size={16} /> {updateCompany.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
