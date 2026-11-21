import net from "node:net";

export function workerRequest(socketPath, envelope, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let data = "";
    const timer = setTimeout(
      () => socket.destroy(new Error("Worker socket timed out.")),
      timeoutMs,
    );
    socket.once("connect", () => socket.write(`${JSON.stringify(envelope)}\n`));
    socket.on("data", (part) => {
      data += part.toString("utf8");
      if (Buffer.byteLength(data) > 1024 * 1024)
        socket.destroy(new Error("Worker response exceeded its bound."));
      else if (data.includes("\n")) {
        try {
          resolve(JSON.parse(data.slice(0, data.indexOf("\n"))));
          socket.end();
        } catch (error) {
          socket.destroy(error);
        }
      }
    });
    socket.once("error", reject);
    socket.once("close", () => {
      clearTimeout(timer);
      if (!data.includes("\n")) reject(new Error("Worker closed without an authenticated result."));
    });
  });
}

export function workerSocketServer(handle) {
  return net.createServer((socket) => {
    let data = "";
    let dispatched = false;
    socket.setTimeout(2000, () => socket.destroy());
    socket.on("error", (error) => console.error("Worker socket error:", error.message));
    socket.on("data", (part) => {
      if (dispatched) return;
      data += part.toString("utf8");
      if (Buffer.byteLength(data) > 65536) {
        socket.destroy();
        return;
      }
      if (!data.includes("\n")) return;
      dispatched = true;
      socket.setTimeout(0);
      Promise.resolve()
        .then(() => handle(JSON.parse(data.slice(0, data.indexOf("\n")))))
        .then(
          (reply) => socket.end(`${JSON.stringify(reply)}\n`),
          (error) => {
            console.error("Leased worker refused request:", error.message);
            socket.destroy();
          },
        );
    });
  });
}
