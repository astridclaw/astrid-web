export type RouteContextParams<
  TParams extends Record<string, string | string[]> = Record<string, string>
> = {
  params: Promise<TParams>
}
