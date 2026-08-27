import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Upload, X, Camera } from 'lucide-react';
import { FileUpload } from './types';

interface StepDocumentsProps {
  files: FileUpload[];
  onFileUpload: (type: 'address_proof' | 'id_proof') => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (type: string) => void;
}

const StepDocuments: React.FC<StepDocumentsProps> = ({ files, onFileUpload, onRemoveFile }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Documents & Photo</h2>
        <p className="text-sm text-muted-foreground">
          Upload the required documents for the new user.
        </p>
      </div>

      <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg border border-border">
        <Camera className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Profile Photo</p>
          <p className="text-xs text-muted-foreground">
            Note: User will capture profile photo via camera on first login
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Address Proof */}
        <div className="space-y-2">
          <Label>Address Proof</Label>
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center transition-colors hover:border-primary/50">
            {files.find(f => f.type === 'address_proof') ? (
              <div className="space-y-3">
                <div className="w-12 h-12 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <Upload className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm text-green-600 font-medium">File uploaded</p>
                <p className="text-xs text-muted-foreground">
                  {files.find(f => f.type === 'address_proof')?.file.name}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveFile('address_proof')}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="w-4 h-4 mr-1" /> Remove
                </Button>
              </div>
            ) : (
              <label className="cursor-pointer block">
                <div className="w-12 h-12 mx-auto bg-muted rounded-full flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium">Upload Address Proof</span>
                <p className="text-xs text-muted-foreground mt-1">PDF, DOC, or Image files</p>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={onFileUpload('address_proof')}
                />
              </label>
            )}
          </div>
        </div>

        {/* ID Proof */}
        <div className="space-y-2">
          <Label>ID Proof</Label>
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center transition-colors hover:border-primary/50">
            {files.find(f => f.type === 'id_proof') ? (
              <div className="space-y-3">
                <div className="w-12 h-12 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <Upload className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm text-green-600 font-medium">File uploaded</p>
                <p className="text-xs text-muted-foreground">
                  {files.find(f => f.type === 'id_proof')?.file.name}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveFile('id_proof')}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="w-4 h-4 mr-1" /> Remove
                </Button>
              </div>
            ) : (
              <label className="cursor-pointer block">
                <div className="w-12 h-12 mx-auto bg-muted rounded-full flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium">Upload ID Proof</span>
                <p className="text-xs text-muted-foreground mt-1">PDF, DOC, or Image files</p>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={onFileUpload('id_proof')}
                />
              </label>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepDocuments;
