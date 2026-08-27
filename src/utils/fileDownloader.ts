import { downloadCSVNative } from './nativeDownload';

export function downloadCSV(data: Record<string, any>[], filename: string) {
  downloadCSVNative(data, filename);
}
