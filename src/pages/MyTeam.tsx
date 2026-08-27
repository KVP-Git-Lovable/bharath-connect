import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, PhoneOff, Search, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DeviceStatusBadges } from "@/components/team/DeviceStatusBadges";

interface TeamMember {
  id: string;
  full_name: string | null;
  username: string | null;
  phone: string | null;
  is_active: boolean;
  role_name: string | null;
  site_name: string | null;
  battery_level: number | null;
  battery_charging: boolean | null;
  network_type: string | null;
  device_status_at: string | null;
}

export default function MyTeam() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["my-team-members"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [usersRes, profilesRes, siteRes] = await Promise.all([
        supabase
          .from("users")
          .select("id, full_name, username, phone, is_active, roles(name), battery_level, battery_charging, network_type, device_status_at")
          .order("full_name", { ascending: true }),
        supabase
          .from("profiles")
          .select("id, phone_number"),
        supabase
          .from("activity_events")
          .select("user_id, site_id, project_sites(site_name)")
          .not("site_id", "is", null)
          .order("created_at", { ascending: false }),
      ]);

      if (usersRes.error) throw usersRes.error;

      // Build phone lookup from profiles table
      const profilePhoneMap = new Map<string, string>();
      if (profilesRes.data) {
        for (const p of profilesRes.data) {
          if (p.phone_number) profilePhoneMap.set(p.id, p.phone_number);
        }
      }

      // Build site lookup
      const siteMap = new Map<string, string>();
      if (siteRes.data) {
        for (const sa of siteRes.data as any[]) {
          if (!siteMap.has(sa.user_id) && sa.project_sites?.site_name) {
            siteMap.set(sa.user_id, sa.project_sites.site_name);
          }
        }
      }

      return (usersRes.data || []).map((u: any) => ({
        id: u.id,
        full_name: u.full_name,
        username: u.username,
        phone: u.phone || profilePhoneMap.get(u.id) || null,
        is_active: u.is_active,
        role_name: u.roles?.name || null,
        site_name: siteMap.get(u.id) || null,
        battery_level: u.battery_level ?? null,
        battery_charging: u.battery_charging ?? null,
        network_type: u.network_type ?? null,
        device_status_at: u.device_status_at ?? null,
      })) as TeamMember[];
    },
    staleTime: 30 * 1000,
  });

  const sites = useMemo(() => {
    const s = new Set<string>();
    members.forEach((m) => m.site_name && s.add(m.site_name));
    return Array.from(s).sort();
  }, [members]);

  const filtered = useMemo(() => {
    return members.filter((m) => {
      const nameMatch =
        !search ||
        (m.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (m.username || "").toLowerCase().includes(search.toLowerCase());
      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "active" && m.is_active) ||
        (statusFilter === "inactive" && !m.is_active);
      const siteMatch = siteFilter === "all" || m.site_name === siteFilter;
      return nameMatch && statusMatch && siteMatch;
    });
  }, [members, search, statusFilter, siteFilter]);

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="p-4 pb-24 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">My Team</h1>
        <Badge variant="secondary" className="ml-auto text-xs">
          {filtered.length} member{filtered.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Search & Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-1/2 h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent side="bottom">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="w-1/2 h-9 text-xs">
              <SelectValue placeholder="Site/Project" />
            </SelectTrigger>
            <SelectContent side="bottom" className="max-h-60 overflow-y-auto">
              <SelectItem value="all">All Sites</SelectItem>
              {sites.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Team List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No team members found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors"
            >
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {getInitials(member.full_name)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {member.full_name || member.username || "Unnamed"}
                  </span>
                  <Badge
                    variant={member.is_active ? "default" : "secondary"}
                    className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                  >
                    {member.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {member.role_name && (
                    <span className="text-xs text-muted-foreground truncate">{member.role_name}</span>
                  )}
                  {member.role_name && member.site_name && (
                    <span className="text-muted-foreground text-xs">•</span>
                  )}
                  {member.site_name && (
                    <span className="text-xs text-muted-foreground truncate">{member.site_name}</span>
                  )}
                  {!member.role_name && !member.site_name && (
                    <span className="text-xs text-muted-foreground">No role/site assigned</span>
                  )}
                </div>
              </div>

              <DeviceStatusBadges
                batteryLevel={member.battery_level}
                batteryCharging={member.battery_charging}
                networkType={member.network_type}
                statusAt={member.device_status_at}
                className="shrink-0"
              />

              {/* Call Button */}
              {member.phone ? (
                <a
                  href={`tel:${member.phone}`}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                  aria-label={`Call ${member.full_name || "user"}`}
                >
                  <Phone className="h-4 w-4" />
                </a>
              ) : (
                <span
                  className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-muted text-muted-foreground cursor-not-allowed shrink-0"
                  title="No phone number available"
                >
                  <PhoneOff className="h-4 w-4" />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
