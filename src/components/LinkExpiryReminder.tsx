import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, BellOff, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface LinkExpiryReminderProps {
  courseId: string;
  userEmail: string;
}

export const LinkExpiryReminder = ({ courseId, userEmail }: LinkExpiryReminderProps) => {
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleReminderToggle = async (enabled: boolean) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('resend-access-email', {
        body: { 
          courseId, 
          email: userEmail,
          action: enabled ? 'schedule-reminder' : 'cancel-reminder'
        }
      });

      if (error) throw error;
      
      setReminderEnabled(enabled);
      toast.success(
        enabled 
          ? "Reminder scheduled - check your email for confirmation" 
          : "Reminder cancelled"
      );
    } catch (err) {
      console.error('Failed to toggle reminder:', err);
      toast.error('Failed to update reminder settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
      <div className="flex items-center gap-3">
        {reminderEnabled ? (
          <Bell className="h-4 w-4 text-primary" />
        ) : (
          <BellOff className="h-4 w-4 text-muted-foreground" />
        )}
        <div className="space-y-0.5">
          <Label htmlFor="reminder-toggle" className="text-sm font-medium cursor-pointer">
            Link Expiry Reminder
          </Label>
          <p className="text-xs text-muted-foreground">
            Get notified 2 hours before your access link expires
          </p>
        </div>
      </div>
      <Switch
        id="reminder-toggle"
        checked={reminderEnabled}
        onCheckedChange={handleReminderToggle}
        disabled={isLoading}
      />
    </div>
  );
};
