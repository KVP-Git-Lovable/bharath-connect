import { useAppConfiguration } from "./useAppConfiguration";
import {
  FieldDef, WorkflowDef, EMPTY_WORKFLOW, mergeWithBuiltins,
} from "@/lib/configSchemas";

/**
 * Typed helpers for reading/writing the per-module `fields` and `workflow`
 * blobs stored in `app_configuration`.
 */
export function useConfigFieldsWorkflow(module: string) {
  const { getValue, setValue, saving } = useAppConfiguration();

  const rawFields = getValue<FieldDef[] | undefined>(module, "fields");
  const fields = mergeWithBuiltins(module, rawFields);

  const workflow = (getValue<WorkflowDef | undefined>(module, "workflow")) ?? EMPTY_WORKFLOW;

  const setFields = (next: FieldDef[]) => {
    const cleaned = next.map((f, i) => ({ ...f, order: i }));
    setValue(module, "fields", cleaned);
  };

  const setWorkflow = (next: WorkflowDef) => setValue(module, "workflow", next);

  return { fields, setFields, workflow, setWorkflow, saving };
}
