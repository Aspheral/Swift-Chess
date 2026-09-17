declare module "node:child_process" {
  interface WritableStream {
    write(data: string): boolean;
  }

  interface ReadableStream {
    setEncoding(encoding: string): void;
    on(event: "data", listener: (chunk: string) => void): this;
  }

  export interface ChildProcessWithoutNullStreams {
    stdin: WritableStream;
    stdout: ReadableStream;
    kill(): boolean;
  }

  export function spawn(
    command: string,
    args: string[],
    options: { stdio: ["pipe", "pipe", "pipe"] },
  ): ChildProcessWithoutNullStreams;
}
