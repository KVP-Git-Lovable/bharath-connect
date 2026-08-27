import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Template {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateSection {
  id: string;
  template_id: string;
  name: string;
  position: number;
  color: string;
  created_at: string;
}

export interface TemplateTask {
  id: string;
  template_id: string;
  section_id?: string;
  parent_task_id?: string;
  title: string;
  description?: string;
  type: string;
  priority: string;
  duration_days: number;
  estimated_hours?: number;
  sort_order: number;
  tags?: string[];
  created_at: string;
}

export interface TemplateDependency {
  id: string;
  template_id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: string;
  created_at: string;
}

export interface TemplateAttachment {
  id: string;
  template_id: string;
  task_id: string;
  file_name: string;
  file_url: string;
  file_size?: number;
  file_type?: string;
  note?: string;
  uploaded_by: string;
  created_at: string;
}

// ─── TEMPLATES ──────────────────────────────────────────

export function useTemplates() {
  return useQuery({
    queryKey: ["pm_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Template[];
    },
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: ["pm_templates", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_templates")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Template;
    },
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("pm_templates")
        .insert({ ...values, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as Template;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm_templates"] });
      toast.success("Template created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; name?: string; description?: string }) => {
      const { data, error } = await supabase
        .from("pm_templates")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pm_templates"] });
      qc.invalidateQueries({ queryKey: ["pm_templates", data.id] });
      toast.success("Template updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pm_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm_templates"] });
      toast.success("Template deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── TEMPLATE SECTIONS ──────────────────────────────────

export function useTemplateSections(templateId: string) {
  return useQuery({
    queryKey: ["pm_template_sections", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_template_sections")
        .select("*")
        .eq("template_id", templateId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as TemplateSection[];
    },
    enabled: !!templateId,
  });
}

export function useCreateTemplateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { template_id: string; name: string; position: number; color?: string }) => {
      const { data, error } = await supabase
        .from("pm_template_sections")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pm_template_sections", data.template_id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateTemplateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, templateId, ...values }: { id: string; templateId: string; name?: string; position?: number; color?: string }) => {
      const { data, error } = await supabase
        .from("pm_template_sections")
        .update(values)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { ...data, template_id: templateId };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pm_template_sections", data.template_id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteTemplateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, templateId }: { id: string; templateId: string }) => {
      const { error } = await supabase.from("pm_template_sections").delete().eq("id", id);
      if (error) throw error;
      return templateId;
    },
    onSuccess: (templateId) => {
      qc.invalidateQueries({ queryKey: ["pm_template_sections", templateId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── TEMPLATE TASKS ─────────────────────────────────────

export function useTemplateTasks(templateId: string) {
  return useQuery({
    queryKey: ["pm_template_tasks", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_template_tasks")
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as TemplateTask[];
    },
    enabled: !!templateId,
  });
}

export function useCreateTemplateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<TemplateTask> & { template_id: string; title: string }) => {
      const { data, error } = await supabase
        .from("pm_template_tasks")
        .insert(values as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pm_template_tasks", data.template_id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateTemplateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, templateId, ...values }: { id: string; templateId: string } & Partial<TemplateTask>) => {
      const { data, error } = await supabase
        .from("pm_template_tasks")
        .update(values as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { ...data, template_id: templateId };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pm_template_tasks", data.template_id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteTemplateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, templateId }: { id: string; templateId: string }) => {
      const { error } = await supabase.from("pm_template_tasks").delete().eq("id", id);
      if (error) throw error;
      return templateId;
    },
    onSuccess: (templateId) => {
      qc.invalidateQueries({ queryKey: ["pm_template_tasks", templateId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── TEMPLATE DEPENDENCIES ──────────────────────────────

export function useTemplateDependencies(templateId: string) {
  return useQuery({
    queryKey: ["pm_template_dependencies", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_template_dependencies")
        .select("*")
        .eq("template_id", templateId);
      if (error) throw error;
      return data as TemplateDependency[];
    },
    enabled: !!templateId,
  });
}

export function useCreateTemplateDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { template_id: string; task_id: string; depends_on_task_id: string; dependency_type: string }) => {
      const { data, error } = await supabase
        .from("pm_template_dependencies")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pm_template_dependencies", data.template_id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteTemplateDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, templateId }: { id: string; templateId: string }) => {
      const { error } = await supabase.from("pm_template_dependencies").delete().eq("id", id);
      if (error) throw error;
      return templateId;
    },
    onSuccess: (templateId) => {
      qc.invalidateQueries({ queryKey: ["pm_template_dependencies", templateId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── TEMPLATE ATTACHMENTS ───────────────────────────────

export function useTemplateAttachments(taskId: string) {
  return useQuery({
    queryKey: ["pm_template_attachments", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_template_attachments")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TemplateAttachment[];
    },
    enabled: !!taskId,
  });
}

export function useCreateTemplateAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { template_id: string; task_id: string; file_name: string; file_url: string; file_size?: number; file_type?: string; note?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("pm_template_attachments")
        .insert({ ...values, uploaded_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pm_template_attachments", data.task_id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteTemplateAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, taskId, fileUrl }: { id: string; taskId: string; fileUrl: string }) => {
      await supabase.storage.from("pm-attachments").remove([fileUrl]);
      const { error } = await supabase.from("pm_template_attachments").delete().eq("id", id);
      if (error) throw error;
      return taskId;
    },
    onSuccess: (taskId) => {
      qc.invalidateQueries({ queryKey: ["pm_template_attachments", taskId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}
