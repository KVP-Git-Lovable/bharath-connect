
-- ═══════════════════════════════════════════════════════════════════════
-- PM MODULE: Enums
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE public.pm_priority AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE public.pm_project_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');
CREATE TYPE public.pm_task_status AS ENUM ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled', 'overdue');
CREATE TYPE public.pm_task_type AS ENUM ('epic', 'story', 'task', 'bug', 'idea', 'milestone');
CREATE TYPE public.pm_sprint_status AS ENUM ('planning', 'active', 'completed', 'cancelled');
CREATE TYPE public.pm_member_role AS ENUM ('owner', 'manager', 'developer', 'designer', 'tester', 'viewer');

-- ═══════════════════════════════════════════════════════════════════════
-- PM MODULE: Core Tables
-- ═══════════════════════════════════════════════════════════════════════

-- Projects
CREATE TABLE public.pm_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status pm_project_status NOT NULL DEFAULT 'planning',
  priority pm_priority NOT NULL DEFAULT 'medium',
  owner_id UUID REFERENCES public.profiles(id),
  start_date DATE,
  end_date DATE,
  estimated_hours NUMERIC DEFAULT 0,
  logged_hours NUMERIC DEFAULT 0,
  budget NUMERIC DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  is_template BOOLEAN NOT NULL DEFAULT false,
  template_name TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sections (Kanban columns)
CREATE TABLE public.pm_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#6B7280',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sprints
CREATE TABLE public.pm_sprints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT,
  status pm_sprint_status NOT NULL DEFAULT 'planning',
  start_date DATE,
  end_date DATE,
  velocity NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Milestones
CREATE TABLE public.pm_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  color TEXT NOT NULL DEFAULT '#8B5CF6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks
CREATE TABLE public.pm_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  sprint_id UUID REFERENCES public.pm_sprints(id) ON DELETE SET NULL,
  milestone_id UUID REFERENCES public.pm_milestones(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.pm_sections(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  type pm_task_type NOT NULL DEFAULT 'task',
  status pm_task_status NOT NULL DEFAULT 'todo',
  priority pm_priority NOT NULL DEFAULT 'medium',
  assignee_id UUID REFERENCES public.profiles(id),
  collaborator_id UUID REFERENCES public.profiles(id),
  reporter_id UUID REFERENCES public.profiles(id),
  start_date DATE,
  due_date DATE,
  estimated_hours NUMERIC DEFAULT 0,
  logged_hours NUMERIC DEFAULT 0,
  story_points NUMERIC DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  block_reason TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- PM MODULE: Supporting Tables
-- ═══════════════════════════════════════════════════════════════════════

-- Task Attachments
CREATE TABLE public.pm_task_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  note TEXT,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Task Dependencies
CREATE TABLE public.pm_task_dependencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'finish_to_start',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Task Collaborators
CREATE TABLE public.pm_task_collaborators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);

-- Task Comments
CREATE TABLE public.pm_task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Time Logs
CREATE TABLE public.pm_time_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  hours NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Project Members
CREATE TABLE public.pm_project_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  role pm_member_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Project Resources
CREATE TABLE public.pm_project_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  role TEXT,
  hourly_rate NUMERIC DEFAULT 0,
  allocated_hours NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Risks
CREATE TABLE public.pm_risks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  probability TEXT NOT NULL DEFAULT 'medium',
  impact TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  mitigation_plan TEXT,
  owner_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- PM MODULE: Template System
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.pm_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pm_template_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.pm_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#6B7280',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pm_template_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.pm_templates(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.pm_template_sections(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES public.pm_template_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'task',
  priority TEXT NOT NULL DEFAULT 'medium',
  duration_days INTEGER NOT NULL DEFAULT 1,
  estimated_hours NUMERIC DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pm_template_dependencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.pm_templates(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.pm_template_tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.pm_template_tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'finish_to_start',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pm_template_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.pm_templates(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.pm_template_tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  note TEXT,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pm_task_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'task',
  priority TEXT NOT NULL DEFAULT 'medium',
  estimated_hours NUMERIC DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- PM MODULE: AI/Extended Features
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.pm_ai_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pm_ideas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  votes INTEGER NOT NULL DEFAULT 0,
  submitted_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pm_knowledge_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  file_url TEXT,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pm_support_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  submitted_by UUID NOT NULL REFERENCES public.profiles(id),
  assigned_to UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- PM MODULE: Enable RLS on all tables
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.pm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_task_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_project_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_template_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_template_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_support_requests ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════
-- PM MODULE: RLS Policies (Admin full access + authenticated read/write)
-- ═══════════════════════════════════════════════════════════════════════

-- pm_projects
CREATE POLICY "Admins can manage all pm_projects" ON public.pm_projects FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_projects" ON public.pm_projects FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_projects" ON public.pm_projects FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own pm_projects" ON public.pm_projects FOR UPDATE USING (created_by = auth.uid() OR owner_id = auth.uid());
CREATE POLICY "Users can delete own pm_projects" ON public.pm_projects FOR DELETE USING (created_by = auth.uid());

-- pm_sections
CREATE POLICY "Admins can manage all pm_sections" ON public.pm_sections FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_sections" ON public.pm_sections FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_sections" ON public.pm_sections FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update pm_sections" ON public.pm_sections FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete pm_sections" ON public.pm_sections FOR DELETE USING (auth.uid() IS NOT NULL);

-- pm_sprints
CREATE POLICY "Admins can manage all pm_sprints" ON public.pm_sprints FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_sprints" ON public.pm_sprints FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_sprints" ON public.pm_sprints FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update pm_sprints" ON public.pm_sprints FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete pm_sprints" ON public.pm_sprints FOR DELETE USING (auth.uid() IS NOT NULL);

-- pm_milestones
CREATE POLICY "Admins can manage all pm_milestones" ON public.pm_milestones FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_milestones" ON public.pm_milestones FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_milestones" ON public.pm_milestones FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update pm_milestones" ON public.pm_milestones FOR UPDATE USING (auth.uid() IS NOT NULL);

-- pm_tasks
CREATE POLICY "Admins can manage all pm_tasks" ON public.pm_tasks FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_tasks" ON public.pm_tasks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_tasks" ON public.pm_tasks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update pm_tasks" ON public.pm_tasks FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete pm_tasks" ON public.pm_tasks FOR DELETE USING (auth.uid() IS NOT NULL);

-- pm_task_attachments
CREATE POLICY "Admins can manage all pm_task_attachments" ON public.pm_task_attachments FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_task_attachments" ON public.pm_task_attachments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_task_attachments" ON public.pm_task_attachments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete own pm_task_attachments" ON public.pm_task_attachments FOR DELETE USING (uploaded_by = auth.uid());

-- pm_task_dependencies
CREATE POLICY "Admins can manage all pm_task_dependencies" ON public.pm_task_dependencies FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_task_dependencies" ON public.pm_task_dependencies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_task_dependencies" ON public.pm_task_dependencies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete pm_task_dependencies" ON public.pm_task_dependencies FOR DELETE USING (auth.uid() IS NOT NULL);

-- pm_task_collaborators
CREATE POLICY "Admins can manage all pm_task_collaborators" ON public.pm_task_collaborators FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_task_collaborators" ON public.pm_task_collaborators FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_task_collaborators" ON public.pm_task_collaborators FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete pm_task_collaborators" ON public.pm_task_collaborators FOR DELETE USING (auth.uid() IS NOT NULL);

-- pm_task_comments
CREATE POLICY "Admins can manage all pm_task_comments" ON public.pm_task_comments FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_task_comments" ON public.pm_task_comments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_task_comments" ON public.pm_task_comments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own pm_task_comments" ON public.pm_task_comments FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own pm_task_comments" ON public.pm_task_comments FOR DELETE USING (user_id = auth.uid());

-- pm_time_logs
CREATE POLICY "Admins can manage all pm_time_logs" ON public.pm_time_logs FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_time_logs" ON public.pm_time_logs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can insert own pm_time_logs" ON public.pm_time_logs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own pm_time_logs" ON public.pm_time_logs FOR DELETE USING (user_id = auth.uid());

-- pm_project_members
CREATE POLICY "Admins can manage all pm_project_members" ON public.pm_project_members FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_project_members" ON public.pm_project_members FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_project_members" ON public.pm_project_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete pm_project_members" ON public.pm_project_members FOR DELETE USING (auth.uid() IS NOT NULL);

-- pm_project_resources
CREATE POLICY "Admins can manage all pm_project_resources" ON public.pm_project_resources FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_project_resources" ON public.pm_project_resources FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_project_resources" ON public.pm_project_resources FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update pm_project_resources" ON public.pm_project_resources FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete pm_project_resources" ON public.pm_project_resources FOR DELETE USING (auth.uid() IS NOT NULL);

-- pm_risks
CREATE POLICY "Admins can manage all pm_risks" ON public.pm_risks FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_risks" ON public.pm_risks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_risks" ON public.pm_risks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update pm_risks" ON public.pm_risks FOR UPDATE USING (auth.uid() IS NOT NULL);

-- pm_templates
CREATE POLICY "Admins can manage all pm_templates" ON public.pm_templates FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_templates" ON public.pm_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_templates" ON public.pm_templates FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own pm_templates" ON public.pm_templates FOR UPDATE USING (created_by = auth.uid());
CREATE POLICY "Users can delete own pm_templates" ON public.pm_templates FOR DELETE USING (created_by = auth.uid());

-- pm_template_sections
CREATE POLICY "Admins can manage all pm_template_sections" ON public.pm_template_sections FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_template_sections" ON public.pm_template_sections FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_template_sections" ON public.pm_template_sections FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update pm_template_sections" ON public.pm_template_sections FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete pm_template_sections" ON public.pm_template_sections FOR DELETE USING (auth.uid() IS NOT NULL);

-- pm_template_tasks
CREATE POLICY "Admins can manage all pm_template_tasks" ON public.pm_template_tasks FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_template_tasks" ON public.pm_template_tasks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_template_tasks" ON public.pm_template_tasks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update pm_template_tasks" ON public.pm_template_tasks FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete pm_template_tasks" ON public.pm_template_tasks FOR DELETE USING (auth.uid() IS NOT NULL);

-- pm_template_dependencies
CREATE POLICY "Admins can manage all pm_template_dependencies" ON public.pm_template_dependencies FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_template_dependencies" ON public.pm_template_dependencies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_template_dependencies" ON public.pm_template_dependencies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete pm_template_dependencies" ON public.pm_template_dependencies FOR DELETE USING (auth.uid() IS NOT NULL);

-- pm_template_attachments
CREATE POLICY "Admins can manage all pm_template_attachments" ON public.pm_template_attachments FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_template_attachments" ON public.pm_template_attachments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_template_attachments" ON public.pm_template_attachments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete pm_template_attachments" ON public.pm_template_attachments FOR DELETE USING (auth.uid() IS NOT NULL);

-- pm_task_templates
CREATE POLICY "Admins can manage all pm_task_templates" ON public.pm_task_templates FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_task_templates" ON public.pm_task_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_task_templates" ON public.pm_task_templates FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own pm_task_templates" ON public.pm_task_templates FOR UPDATE USING (created_by = auth.uid());
CREATE POLICY "Users can delete own pm_task_templates" ON public.pm_task_templates FOR DELETE USING (created_by = auth.uid());

-- pm_ai_insights
CREATE POLICY "Admins can manage all pm_ai_insights" ON public.pm_ai_insights FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_ai_insights" ON public.pm_ai_insights FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_ai_insights" ON public.pm_ai_insights FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- pm_ideas
CREATE POLICY "Admins can manage all pm_ideas" ON public.pm_ideas FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_ideas" ON public.pm_ideas FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_ideas" ON public.pm_ideas FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own pm_ideas" ON public.pm_ideas FOR UPDATE USING (submitted_by = auth.uid());

-- pm_knowledge_documents
CREATE POLICY "Admins can manage all pm_knowledge_documents" ON public.pm_knowledge_documents FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_knowledge_documents" ON public.pm_knowledge_documents FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_knowledge_documents" ON public.pm_knowledge_documents FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own pm_knowledge_documents" ON public.pm_knowledge_documents FOR UPDATE USING (uploaded_by = auth.uid());
CREATE POLICY "Users can delete own pm_knowledge_documents" ON public.pm_knowledge_documents FOR DELETE USING (uploaded_by = auth.uid());

-- pm_support_requests
CREATE POLICY "Admins can manage all pm_support_requests" ON public.pm_support_requests FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pm_support_requests" ON public.pm_support_requests FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can insert pm_support_requests" ON public.pm_support_requests FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own pm_support_requests" ON public.pm_support_requests FOR UPDATE USING (submitted_by = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════
-- PM MODULE: Storage Bucket
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public) VALUES ('pm-attachments', 'pm-attachments', false);

CREATE POLICY "Authenticated can upload pm attachments" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'pm-attachments' AND auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can view pm attachments" ON storage.objects FOR SELECT USING (bucket_id = 'pm-attachments' AND auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete own pm attachments" ON storage.objects FOR DELETE USING (bucket_id = 'pm-attachments' AND auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════
-- PM MODULE: Updated_at triggers
-- ═══════════════════════════════════════════════════════════════════════

CREATE TRIGGER update_pm_projects_updated_at BEFORE UPDATE ON public.pm_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pm_sections_updated_at BEFORE UPDATE ON public.pm_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pm_sprints_updated_at BEFORE UPDATE ON public.pm_sprints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pm_milestones_updated_at BEFORE UPDATE ON public.pm_milestones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pm_tasks_updated_at BEFORE UPDATE ON public.pm_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pm_task_comments_updated_at BEFORE UPDATE ON public.pm_task_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pm_project_resources_updated_at BEFORE UPDATE ON public.pm_project_resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pm_risks_updated_at BEFORE UPDATE ON public.pm_risks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pm_templates_updated_at BEFORE UPDATE ON public.pm_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pm_ideas_updated_at BEFORE UPDATE ON public.pm_ideas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pm_knowledge_documents_updated_at BEFORE UPDATE ON public.pm_knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pm_support_requests_updated_at BEFORE UPDATE ON public.pm_support_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pm_task_templates_updated_at BEFORE UPDATE ON public.pm_task_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
