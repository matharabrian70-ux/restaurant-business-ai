import { createConfiguredTransport } from "./src/sales/provider-factory.js";
import { AutonomousWorker } from "./src/autonomy/worker.js";
import { createHandoffNotifier } from "./src/autonomy/notify.js";

const env = process.env;
const transport = createConfiguredTransport(env);

const worker = new AutonomousWorker({
  env,
  transport,
  notify: createHandoffNotifier({
    transport,
    recipient: env.AUTONOMY_HANDOFF_RECIPIENT,
    sender: env.RESEND_FROM
  })
});

await worker.discoverAndSend();
await worker.store.close();
