import { handlePublicVideoResponseRequest } from "../../../../lib/server/publicVideoResponseRequest";

export async function POST(request: Request) {
  return handlePublicVideoResponseRequest({ request });
}
