// global.d.ts
export {}; // Ensure this file is treated as a module.

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string | string[]>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  readonly kind: 'file' | 'directory';
  readonly name: string;
  isSameEntry(other: FileSystemHandle): Promise<boolean>;
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string | WriteParams): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
  // close() is inherited from WritableStream
}

interface WriteParams {
  type: 'write' | 'seek' | 'truncate';
  data?: BufferSource | Blob | string;
  position?: number;
  size?: number;
}


interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: 'file';
  getFile(): Promise<File>;
  createWritable(options?: FileSystemWritableFileStreamOptions): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStreamOptions {
  keepExistingData?: boolean;
}

// Augment the Window interface
declare global {
  interface Window {
    showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  }
}
