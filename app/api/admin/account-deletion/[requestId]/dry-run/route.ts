import { handleAccountDeletionDryRunRequest } from "../../../../../../lib/server/accountDeletionDryRunHandler";

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { requestId } = await context.params;
  const result = await handleAccountDeletionDryRunRequest({
    request,
    requestId,
  });

  if (!result.ok) {
    return Response.json(result.body, { status: result.status });
  }

  return Response.json(result.body, { status: result.status });
}
