import { watchWorker } from "../../services/omni-sandbox/worker-watchdog.mjs";
let input = "";
for await (const part of process.stdin) input += part;
try {
  console.log(JSON.stringify(await watchWorker(JSON.parse(input))));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
