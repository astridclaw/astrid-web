/**
 * Minimal type declarations for express when @types/express is not installed.
 * This allows the server code to compile without requiring express as a dependency.
 */

declare module 'express' {
  interface Request {
    rawBody?: Buffer
    body: Record<string, unknown>
    headers: Record<string, string | string[] | undefined>
  }

  interface Response {
    json(data: unknown): Response
    status(code: number): Response
  }

  interface Application {
    use(handler: unknown): Application
    get(path: string, handler: (req: Request, res: Response) => void | Promise<void>): Application
    post(path: string, handler: (req: Request, res: Response) => void | Promise<void>): Application
    listen(port: number, host: string, callback: () => void): void
  }

  interface JsonOptions {
    verify?: (req: Request, res: Response, buf: Buffer) => void
  }

  interface Express {
    (): Application
    json(options?: JsonOptions): unknown
  }

  const express: Express
  export default express
  export { Request, Response, Application }
}
