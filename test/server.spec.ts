import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { io as Client, Socket as ClientSocket } from "socket.io-client";
import { backend } from "../src/server";

describe('testing websocket server', function () {
  let io: Server, serverSocket: Socket, clientSocket: ClientSocket;
  let be: any;
  beforeAll((done) => {
    const httpServer = createServer();
    io = new Server(httpServer);
    httpServer.listen(() => {
      const address = httpServer.address();
      if (typeof address !== "string" && address !== null) {
        const port = address.port;
        clientSocket = Client(`http://localhost:${port}`);
        io.on("connection", (socket) => {
          serverSocket = socket;
        });
        clientSocket.on("connect", done);
      }
    });
    be = new backend("./test/minecraft", io, {});
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
    be.shutdown();
  });

  test("should receive heartbeat", done => {
    clientSocket.on("host_heartbeat", (heartbeat) => {
      expect(heartbeat).toBeDefined();
      expect(heartbeat).toHaveProperty("uptime");
      expect(heartbeat).toHaveProperty("freemem");
      expect(heartbeat).toHaveProperty("loadavg");
      expect(heartbeat.loadavg).toHaveLength(3);
      done()
    });
  });
});