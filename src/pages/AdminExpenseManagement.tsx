import { Navigate, useNavigate } from "react-router-dom";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, BarChart3, Loader2, Receipt, Settings } from "lucide-react";
import ExpensePolicyConfig from "@/components/expenses/ExpensePolicyConfig";
import TeamExpenseSummary from "@/components/expenses/TeamExpenseSummary";

export default function AdminExpenseManagement() {
  const navigate = useNavigate();
  const { hasAdminAccess, isLoading } = useAdminAccess();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!hasAdminAccess) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-3 sm:px-6 sm:py-4">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate("/admin-controls")} aria-label="Back to admin controls">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-primary/10 bg-primary/10 shadow-card">
            <Receipt className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold sm:text-2xl">Expense Master</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              Manage expense policies, approvals & team productivity
            </p>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-5 grid h-11 w-full grid-cols-2 rounded-sm bg-muted/70 p-1">
            <TabsTrigger value="overview" className="gap-1.5 rounded-sm text-xs data-[state=active]:text-info sm:text-sm"><BarChart3 className="h-4 w-4" />Overview</TabsTrigger>
            <TabsTrigger value="configuration" className="gap-1.5 rounded-sm text-xs data-[state=active]:text-accent sm:text-sm"><Settings className="h-4 w-4" />Configuration</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0">
            <TeamExpenseSummary />
          </TabsContent>
          <TabsContent value="configuration" className="mt-0">
            <ExpensePolicyConfig />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
