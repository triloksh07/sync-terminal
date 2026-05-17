export interface PTYOptions {
  shell?: string;
  args?: string[];
  cols: number;
  rows: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface PTYEvents {
  output: (data: string) => void;
  exit: (code: number | null, signal: string | null) => void;
  error: (error: Error) => void;
}
