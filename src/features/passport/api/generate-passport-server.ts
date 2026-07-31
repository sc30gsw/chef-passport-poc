import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { streamPassportEvents } from "~/features/passport/api/generate-passport";
import { PassportStreamRequest } from "~/features/passport/types/passport-stream-request";
import { passportPipelineFromCache, passportPipelineLive } from "~/lib/runtime";

/**
 * The boundary, and nothing else. `tanstackStart()` strips the handler from the client build and
 * drops the imports only that handler referenced, so the composition point, the pipeline and the
 * gateway client all stay server-side while the browser keeps the callable stub and the request
 * schema. See .claude/rules/web/tanstack-start.md.
 *
 * An async generator is the transport: seroval streams async iterators frame by frame, so the
 * browser sees each `PipelineEvent` as it is produced rather than a single payload at the end.
 * `src/features/passport/api/generate-passport.test.ts` holds the incremental-delivery proof that
 * closed decision #6 requires against TanStack/router#7529.
 *
 * The cache Layer is taken **paced** here, unlike the SSR loader in `passport-server.ts`: this is
 * the timeline itself, so the recorded step durations are what the events are spaced by.
 */
export const generatePassportServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Schema.decodeUnknownSync(PassportStreamRequest)(data))
  .handler(({ data }) =>
    streamPassportEvents(data, {
      cache: passportPipelineFromCache,
      live: passportPipelineLive,
    }),
  );
