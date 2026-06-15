import { Sparkles } from "lucide-react";
import { CopilotChat } from "@/components/copilot";
import { Card } from "@/components/ui";

export const metadata = {
  title: "uMotor AI — Copilot",
};

export default function CopilotPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#1769d6] text-white shadow-md">
          <Sparkles size={22} />
        </span>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">uMotor AI</h1>
          <p className="mt-1 text-muted">
            Analis ops bertenaga Claude — bertanya dalam bahasa biasa, dijawab dari data platform live.
          </p>
        </div>
      </div>

      <Card className="flex-1">
        <CopilotChat />
      </Card>
    </div>
  );
}
