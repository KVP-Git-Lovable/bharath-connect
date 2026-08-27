import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Shield, Lock, KeyRound, Users2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SecurityProfilesList from "@/components/security/SecurityProfilesList";
import RolePermissionsMatrix from "@/components/security/RolePermissionsMatrix";
import UserProfileAssignments from "@/components/security/UserProfileAssignments";

export default function SecurityManagement() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("profiles");

  return (
    <motion.div className="space-y-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Hero Header */}
      <div className="gradient-hero px-4 pt-4 pb-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Security & Access Control</h1>
              <p className="text-sm text-white/70">Manage user profiles, permissions, and data access</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 md:px-4 space-y-4 md:space-y-5 pt-4 md:pt-5">
        {/* How Security Works Card */}
        <Card className="border-border/60">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center gap-2 mb-2 md:mb-3">
              <Lock className="h-4 w-4 text-foreground" />
              <h2 className="font-semibold text-sm md:text-base">How Security Works</h2>
            </div>
            <div className="space-y-1.5 text-xs md:text-sm">
              <p>
                <span className="font-semibold text-foreground">Role Permissions:</span>{" "}
                <span className="text-muted-foreground">Control what modules, fields, actions & widgets each role can access (View, Create, Edit, Delete)</span>
              </p>
              <p>
                <span className="font-semibold text-foreground">Permission Set Groups:</span>{" "}
                <span className="text-muted-foreground">Override role permissions for specific users when needed</span>
              </p>
              <p>
                <span className="font-semibold text-foreground">Manager Hierarchy:</span>{" "}
                <span className="text-muted-foreground">Managers automatically see their team's data based on reporting structure</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0 gap-0">
              <TabsTrigger
                value="profiles"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none flex-1 px-2 md:px-4 py-2.5 text-xs md:text-sm gap-1 md:gap-1.5 text-muted-foreground data-[state=active]:text-foreground"
              >
                <KeyRound className="h-3.5 w-3.5 hidden md:inline-block" />
                Profiles
              </TabsTrigger>
              <TabsTrigger
                value="permissions"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none flex-1 px-2 md:px-4 py-2.5 text-xs md:text-sm gap-1 md:gap-1.5 text-muted-foreground data-[state=active]:text-foreground"
              >
                <Shield className="h-3.5 w-3.5 hidden md:inline-block" />
                Permissions
              </TabsTrigger>
              <TabsTrigger
                value="assignments"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none flex-1 px-2 md:px-4 py-2.5 text-xs md:text-sm gap-1 md:gap-1.5 text-muted-foreground data-[state=active]:text-foreground"
              >
                <Users2 className="h-3.5 w-3.5 hidden md:inline-block" />
                Groups
              </TabsTrigger>
            </TabsList>

          <TabsContent value="profiles" className="mt-5">
            <SecurityProfilesList />
          </TabsContent>

          <TabsContent value="permissions" className="mt-5">
            <RolePermissionsMatrix />
          </TabsContent>

          <TabsContent value="assignments" className="mt-5">
            <UserProfileAssignments />
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}
