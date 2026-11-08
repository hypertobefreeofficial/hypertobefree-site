import { handleAccountDeletionExecutionPreflightRequest } from "../../../../../../lib/server/accountDeletionExecutionPreflightHandler";

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { requestId } = await context.params;
  const result = await handleAccountDeletionExecutionPreflightRequest({
    request,
    requestId,
  });

  return Response.json(result.body, { status: result.status });
}
