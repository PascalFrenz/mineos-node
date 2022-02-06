import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { io as Client, Socket as ClientSocket } from "socket.io-client";
import { Backend } from "../src/server";

describe('testing websocket server', () => {
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
    be = new Backend("./test/minecraft", io, {});
  });

  afterAll((done) => {
    io.close();
    clientSocket.close();
    be.shutdown();
    done();
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