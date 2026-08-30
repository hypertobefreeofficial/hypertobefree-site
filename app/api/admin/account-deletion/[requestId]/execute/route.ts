import { handleAccountDeletionExecuteRequest } from "../../../../../../lib/server/accountDeletionExecuteHandler";

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { requestId } = await context.params;
  const result = await handleAccountDeletionExecuteRequest({
    request,
    requestId,
  });

  if (!result.ok) {
    return Response.json(result.body, { status: result.status });
  }

  return Response.json(result.body, { status: result.status });
}
