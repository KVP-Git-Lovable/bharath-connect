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
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" className="p-1.5" onClick={() => navigate("/admin-controls")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="hidden sm:flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <Receipt className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold truncate">Expense Master</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              Manage expense policies, approvals & team productivity
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-10 mb-4">
            <TabsTrigger value="overview" className="text-xs sm:text-sm gap-1.5"><BarChart3 className="h-4 w-4" />Overview</TabsTrigger>
            <TabsTrigger value="configuration" className="text-xs sm:text-sm gap-1.5"><Settings className="h-4 w-4" />Configuration</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0">
            <TeamExpenseSummary />
          </TabsContent>
          <TabsContent value="configuration" className="mt-0">
            <ExpensePolicyConfig />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
