import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { streamFreeInputEvents } from "~/features/passport/api/free-input";
import { FreeInputRequest } from "~/features/passport/types/free-input-request";
import { passportPipelineLive } from "~/lib/runtime";

/**
 * The boundary, and nothing else. `tanstackStart()` strips the handler from the client build and
 * drops the imports only that handler referenced, so the composition point, the pipeline and the
 * gateway client stay server-side while the browser keeps the callable stub and the request schema.
 * See .claude/rules/web/tanstack-start.md.
 *
 * The schema lives in `types/free-input-request.ts` rather than here because `inputValidator` runs
 * on the client too — importing it from this module would pull the handler's graph back in.
 *
 * An async generator is the transport, matching preset generation: seroval streams async iterators
 * frame by frame, so the browser sees each `PipelineEvent` as it is produced. There is no cache
 * Layer to pass — free input has nothing to replay, so its guards refuse instead of degrading.
 */
export const generateFreePassportServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Schema.decodeUnknownSync(FreeInputRequest)(data))
  .handler(({ data }) => streamFreeInputEvents(data, { live: passportPipelineLive }));
